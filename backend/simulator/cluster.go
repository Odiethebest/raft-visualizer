// Package simulator wires together a set of Raft nodes into a running cluster.
// It owns the message bus, fault injection, and state aggregation. It has no
// knowledge of WebSocket — it calls a registered callback with snapshots and
// the caller decides what to do with them.
package simulator

import (
	"sync"
	"time"

	"github.com/yourusername/raft-visualizer/raft"
)

// inFlightTTL controls how long an in-flight RPC stays visible in the UI.
// 150ms is long enough for the frontend to animate it, but short enough that
// the graph doesn't fill up with stale arrows.
const inFlightTTL = 150 * time.Millisecond

// maxInFlight bounds the number of in-flight RPCs carried in a snapshot.
// Without a hard cap, a long period with no snapshot emission (no state
// changes) can accumulate a very large inFlight slice and produce a huge
// first payload when the next snapshot finally emits.
const maxInFlight = 256

// snapshotInterval is the minimum time between WebSocket broadcasts. The Raft
// nodes generate state changes at ~600/s (heartbeats × nodes × replies), but
// the browser only needs ~20 fps for smooth animation. Without throttling,
// the frontend drowns in JSON parsing and React re-renders.
const snapshotInterval = 50 * time.Millisecond

// InFlightMessage is a point-in-time record of an RPC currently in transit.
// These are included in every ClusterSnapshot so the frontend can draw
// animated arrows between nodes.
type InFlightMessage struct {
	From int    `json:"from"`
	To   int    `json:"to"`
	Type string `json:"type"` // "RequestVote", "AppendEntries", etc.
	Term int    `json:"term"`

	// sentAt is not exported — it's only used internally to expire entries.
	sentAt time.Time
}

// ClusterSnapshot is the full state of the cluster at a point in time.
// This is what gets serialized into a STATE_UPDATE WebSocket message.
type ClusterSnapshot struct {
	Nodes    []raft.Snapshot   `json:"nodes"`
	InFlight []InFlightMessage `json:"inFlight"`
}

// Cluster manages N Raft nodes and the message bus between them.
// All public methods are safe to call concurrently.
type Cluster struct {
	mu    sync.Mutex
	nodes []*raft.Node
	// inboxes[i] is the send end of node i's mailbox. The cluster writes
	// here when routing messages; the node reads from the other end.
	inboxes []chan raft.Message

	stopCh chan struct{}

	// partitioned[{a,b}] == true means messages from a to b are silently dropped.
	// Partitions are always bidirectional — set by Partition() and cleared by Heal().
	partitioned map[[2]int]bool

	// inFlight is a sliding window of recently sent RPCs. Entries older than
	// inFlightTTL are pruned on every snapshot emission.
	inFlight []InFlightMessage

	// snapshotCh is a size-1 "dirty flag" channel. Node onChange callbacks
	// do a non-blocking send here instead of calling emitSnapshot directly.
	// A dedicated goroutine (runSnapshotLoop) drains it and builds/broadcasts
	// the snapshot off the hot path. This prevents node Run goroutines from
	// blocking on lock acquisition and JSON serialization, which was causing
	// a livelock: snapshot emission held node locks long enough to starve
	// message processing, so election timers always fired before votes could
	// be collected.
	snapshotCh chan struct{}

	// onStateChange is called after any node state transition with the full
	// current cluster snapshot. The callback runs on the snapshot goroutine,
	// never on a node's Run goroutine.
	onStateChange func(ClusterSnapshot)
}

// New creates a cluster of n nodes, starts them, and returns the Cluster.
// onStateChange is called every time any node's state changes; pass nil if
// you don't need it (e.g., in tests).
//
// The cluster runs until Stop() is called. The caller is responsible for
// calling Stop() to clean up the node goroutines.
func New(n int, onStateChange func(ClusterSnapshot)) *Cluster {
	c := &Cluster{
		nodes:         make([]*raft.Node, n),
		inboxes:       make([]chan raft.Message, n),
		stopCh:        make(chan struct{}),
		partitioned:   make(map[[2]int]bool),
		snapshotCh:    make(chan struct{}, 1),
		onStateChange: onStateChange,
	}

	for i := range n {
		c.inboxes[i] = make(chan raft.Message, 128)
	}

	for i := range n {
		id := i
		peers := make([]int, 0, n-1)
		for j := range n {
			if j != i {
				peers = append(peers, j)
			}
		}

		sendFn := func(msg raft.Message) {
			c.route(msg)
		}

		changeFn := func(_ raft.Snapshot) {
			// Signal the snapshot goroutine instead of calling emitSnapshot
			// directly. This keeps the node's Run goroutine free to process
			// messages — the previous synchronous call was blocking on lock
			// acquisition and JSON serialization, starving election vote
			// delivery and causing a term-increment livelock.
			c.notifySnapshot()
		}

		c.nodes[i] = raft.NewNode(id, peers, c.inboxes[i], sendFn, changeFn)
	}

	// Dedicated goroutine for snapshot emission. Decouples the expensive
	// buildSnapshot + broadcast work from the node Run goroutines.
	go c.runSnapshotLoop()

	for _, node := range c.nodes {
		go node.Run(c.stopCh)
	}

	return c
}

// Stop shuts down all node goroutines. After Stop returns, the cluster is
// inert — no further callbacks will fire.
func (c *Cluster) Stop() {
	close(c.stopCh)
}

// SubmitCommand routes a client command to the current leader. Returns false
// if there is no live leader at this moment (e.g., mid-election).
func (c *Cluster) SubmitCommand(cmd string) bool {
	c.mu.Lock()
	nodes := c.nodes
	c.mu.Unlock()

	for _, n := range nodes {
		if n.SubmitCommand(cmd) {
			return true
		}
	}
	return false
}

// KillNode simulates a hard crash of node id. The node stops processing
// messages; its election timer is suspended so it won't disrupt the cluster.
func (c *Cluster) KillNode(id int) {
	c.mu.Lock()
	node := c.nodes[id]
	c.mu.Unlock()
	node.Kill()
}

// RestartNode brings a previously killed node back online as a follower.
func (c *Cluster) RestartNode(id int) {
	c.mu.Lock()
	node := c.nodes[id]
	c.mu.Unlock()
	node.Restart()
}

// Partition installs a bidirectional message drop between every pair of nodes
// that span the two groups. Messages within a group still flow freely.
//
// Example: Partition([]int{0,1}, []int{2,3,4}) cuts the link between the
// first two nodes and the last three. Nodes 0 and 1 can still talk to each
// other; same for 2, 3, and 4.
func (c *Cluster) Partition(groupA, groupB []int) {
	c.mu.Lock()
	for _, a := range groupA {
		for _, b := range groupB {
			c.partitioned[[2]int{a, b}] = true
			c.partitioned[[2]int{b, a}] = true
		}
	}
	c.mu.Unlock()
	c.notifySnapshot()
}

// Heal removes all active partitions, restoring full connectivity.
func (c *Cluster) Heal() {
	c.mu.Lock()
	c.partitioned = make(map[[2]int]bool)
	c.mu.Unlock()
	c.notifySnapshot()
}

// Snapshot returns the current cluster state without triggering a callback.
// Safe to call from any goroutine.
func (c *Cluster) Snapshot() ClusterSnapshot {
	return c.buildSnapshot()
}

// --- internal ---

// notifySnapshot does a non-blocking send on snapshotCh. Multiple rapid
// signals collapse into one, just like the node's changeCh pattern.
func (c *Cluster) notifySnapshot() {
	select {
	case c.snapshotCh <- struct{}{}:
	default:
	}
}

// runSnapshotLoop is the single goroutine that builds and broadcasts cluster
// snapshots. It coalesces rapid state changes into at most one broadcast per
// snapshotInterval, giving the frontend a steady ~20 fps update rate instead
// of the raw ~600 changes/second the Raft nodes produce.
func (c *Cluster) runSnapshotLoop() {
	ticker := time.NewTicker(snapshotInterval)
	defer ticker.Stop()

	dirty := false
	for {
		select {
		case <-c.stopCh:
			return
		case <-c.snapshotCh:
			dirty = true
		case <-ticker.C:
			if dirty {
				dirty = false
				c.emitSnapshot()
			}
		}
	}
}

// route delivers a message to its destination, or drops it if the link is
// partitioned. Either way, the message is recorded as in-flight for the TTL
// window so the frontend can animate it before it arrives (or disappears).
func (c *Cluster) route(msg raft.Message) {
	c.mu.Lock()
	dropped := c.partitioned[[2]int{msg.From, msg.To}]

	c.inFlight = append(c.inFlight, InFlightMessage{
		From:   msg.From,
		To:     msg.To,
		Type:   rpcTypeName(msg.Type),
		Term:   rpcTerm(msg),
		sentAt: time.Now(),
	})
	c.pruneInFlightLocked(time.Now())
	c.mu.Unlock()

	if dropped {
		return
	}

	select {
	case c.inboxes[msg.To] <- msg:
	default:
		// Inbox full — treat as a dropped message. This shouldn't happen
		// under normal conditions with a buffer of 128, but is preferable
		// to blocking the sender's goroutine.
	}
}

// emitSnapshot collects the current cluster state and fires onStateChange.
// Must NOT be called with c.mu held.
func (c *Cluster) emitSnapshot() {
	if c.onStateChange == nil {
		return
	}
	snap := c.buildSnapshot() // buildSnapshot acquires and releases c.mu internally
	c.onStateChange(snap)
}

// buildSnapshot assembles a ClusterSnapshot from all node snapshots.
// Must NOT be called with c.mu held, because Node.Snapshot() acquires each
// node's own lock — holding c.mu at the same time would create a lock-ordering
// hazard if any node callback tries to acquire c.mu.
func (c *Cluster) buildSnapshot() ClusterSnapshot {
	c.mu.Lock()
	c.pruneInFlightLocked(time.Now())

	nodes := make([]*raft.Node, len(c.nodes))
	copy(nodes, c.nodes)
	inFlight := make([]InFlightMessage, len(c.inFlight))
	copy(inFlight, c.inFlight)
	c.mu.Unlock()

	// Call Snapshot() on each node outside c.mu. Each node acquires its own
	// lock briefly, so there is no lock ordering issue here.
	snaps := make([]raft.Snapshot, len(nodes))
	for i, n := range nodes {
		snaps[i] = n.Snapshot()
	}

	return ClusterSnapshot{
		Nodes:    snaps,
		InFlight: inFlight,
	}
}

// pruneInFlightLocked drops expired entries and then enforces a hard tail cap.
// Caller must hold c.mu.
func (c *Cluster) pruneInFlightLocked(now time.Time) {
	live := c.inFlight[:0]
	for _, m := range c.inFlight {
		if now.Sub(m.sentAt) < inFlightTTL {
			live = append(live, m)
		}
	}
	c.inFlight = live

	if len(c.inFlight) > maxInFlight {
		c.inFlight = c.inFlight[len(c.inFlight)-maxInFlight:]
	}
}

// rpcTypeName converts a numeric RPCType to a human-readable string for the
// frontend. These strings are part of the WebSocket protocol — don't change
// them without updating the frontend as well.
func rpcTypeName(t raft.RPCType) string {
	switch t {
	case raft.MsgRequestVote:
		return "RequestVote"
	case raft.MsgRequestVoteReply:
		return "RequestVoteReply"
	case raft.MsgAppendEntries:
		return "AppendEntries"
	case raft.MsgAppendEntriesReply:
		return "AppendEntriesReply"
	default:
		return "Unknown"
	}
}

// rpcTerm extracts the term from whichever RPC payload is set in the message.
// Used for the in-flight display so the frontend can show the term alongside
// the arrow.
func rpcTerm(msg raft.Message) int {
	switch msg.Type {
	case raft.MsgRequestVote:
		if msg.RequestVote != nil {
			return msg.RequestVote.Term
		}
	case raft.MsgRequestVoteReply:
		if msg.RequestVoteReply != nil {
			return msg.RequestVoteReply.Term
		}
	case raft.MsgAppendEntries:
		if msg.AppendEntries != nil {
			return msg.AppendEntries.Term
		}
	case raft.MsgAppendEntriesReply:
		if msg.AppendEntriesReply != nil {
			return msg.AppendEntriesReply.Term
		}
	}
	return 0
}
