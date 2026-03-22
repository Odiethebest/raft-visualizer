package raft

import (
	"math/rand"
	"sync"
	"time"
)

const (
	// electionTimeoutMin / Max follow the Raft paper's recommendation of 150–300ms.
	// The randomization is what prevents split votes from becoming a livelock:
	// if all nodes timed out simultaneously every time, you'd never elect a leader.
	electionTimeoutMin = 150 * time.Millisecond
	electionTimeoutMax = 300 * time.Millisecond

	// heartbeatInterval must be significantly shorter than the election timeout
	// floor so that a live leader always suppresses follower timeouts before they
	// fire. Raft paper suggests heartbeat << election timeout.
	heartbeatInterval = 50 * time.Millisecond
)

// Node is a single Raft participant. Each node runs in its own goroutine
// (via Run) and communicates exclusively through Inbox for incoming messages
// and send (a function provided by the simulator) for outgoing ones.
//
// All mutable fields below are owned by the Run goroutine. No other goroutine
// should read or write them directly — use Snapshot() which acquires mu.
type Node struct {
	mu sync.Mutex

	id    int
	peers []int // IDs of the other nodes in the cluster

	// Persistent state (in a real implementation these would survive crashes).
	currentTerm int
	votedFor    int // -1 means no vote cast in the current term
	log         []LogEntry

	// Volatile state on all servers.
	commitIndex int
	lastApplied int

	// Volatile state on leaders only (reinitialized after each election).
	// nextIndex[peer] is the next log index to send to that peer.
	// matchIndex[peer] is the highest log index known to be replicated there.
	// sentUpTo[peer] is the last log index included in the most recent
	// AppendEntries we sent to that peer. We need this in the reply handler
	// because by the time the reply arrives, nextIndex may not reflect what
	// was actually in that particular RPC.
	nextIndex  map[int]int
	matchIndex map[int]int
	sentUpTo   map[int]int

	role Role
	// votesReceived tracks which peers have granted us a vote in the current
	// election. It's re-initialized at the start of each new election and
	// only meaningful when role == Candidate.
	votesReceived map[int]bool

	alive bool // false means the node is "crashed" — it ignores all messages

	// electionTimer fires when we haven't heard from a leader. Reset on every
	// valid AppendEntries (including heartbeats). We own this timer exclusively
	// inside the Run loop; no other goroutine touches it.
	electionTimer *time.Timer

	// Inbox is the receive end of this node's message channel. The simulator
	// writes to the corresponding send end; this node only reads from it.
	Inbox <-chan Message

	// send routes an outgoing message through the simulator's message bus.
	// It's a function rather than a channel reference so the simulator can
	// intercept or drop messages for fault injection.
	send func(Message)

	// onChange is called by the Run goroutine after any state transition that
	// the UI should know about. The simulator registers a callback here to
	// aggregate snapshots and push them over WebSocket.
	onChange func(Snapshot)
}

// NewNode constructs a node but does not start it. Call Run() in a goroutine.
// inbox is the receive end of the node's mailbox; the caller holds the send end.
// sendFn routes outgoing messages; onChangeFn is called on every state transition.
func NewNode(id int, peers []int, inbox <-chan Message, sendFn func(Message), onChangeFn func(Snapshot)) *Node {
	n := &Node{
		id:       id,
		peers:    peers,
		votedFor: -1,
		log:      []LogEntry{},
		role:     Follower,
		alive:    true,
		Inbox:    inbox,
		send:     sendFn,
		onChange: onChangeFn,
	}
	return n
}

// Run is the main event loop for this node. It must be called in its own
// goroutine; it exits only when stopCh is closed. The caller is responsible
// for closing stopCh to clean up the goroutine.
func (n *Node) Run(stopCh <-chan struct{}) {
	n.electionTimer = time.NewTimer(n.randomElectionTimeout())

	for {
		select {
		case <-stopCh:
			n.electionTimer.Stop()
			return

		case msg := <-n.Inbox:
			if !n.alive {
				// Crashed nodes drop all messages, including heartbeats.
				// This simulates a hard kill — the election timer is also
				// stopped below when the node is killed, so we won't start
				// a spurious election while "dead".
				continue
			}
			n.handleMessage(msg)

		case <-n.electionTimer.C:
			if !n.alive {
				continue
			}
			// No heartbeat arrived before the timer fired — assume the leader
			// is gone (or this is the first boot) and start an election.
			n.startElection()
		}
	}
}

// handleMessage dispatches an incoming message to the appropriate handler.
// All handlers may update node state and call notifyChange().
func (n *Node) handleMessage(msg Message) {
	switch msg.Type {
	case MsgRequestVote:
		n.handleRequestVote(msg)
	case MsgRequestVoteReply:
		n.handleRequestVoteReply(msg)
	case MsgAppendEntries:
		n.handleAppendEntries(msg)
	case MsgAppendEntriesReply:
		n.handleAppendEntriesReply(msg)
	}
}

// maybeStepDown checks whether the incoming term is higher than ours.
// If so, we immediately revert to follower — regardless of our current role.
// This is called at the top of every RPC handler because Raft guarantees that
// any server with a higher term is more authoritative than us.
func (n *Node) maybeStepDown(incomingTerm int) {
	if incomingTerm > n.currentTerm {
		n.currentTerm = incomingTerm
		n.role = Follower
		n.votedFor = -1
		n.notifyChange()
	}
}

// becomeLeader initializes leader-specific volatile state and starts sending
// heartbeats. Called only after winning an election (majority votes received).
func (n *Node) becomeLeader() {
	n.role = Leader
	n.nextIndex = make(map[int]int)
	n.matchIndex = make(map[int]int)
	n.sentUpTo = make(map[int]int)

	// nextIndex starts optimistically at the end of our log. If a follower's
	// log diverges, we'll roll back on rejection.
	nextIdx := n.lastLogIndex() + 1
	for _, peer := range n.peers {
		n.nextIndex[peer] = nextIdx
		n.matchIndex[peer] = 0
		n.sentUpTo[peer] = 0
	}

	n.notifyChange()
	n.sendHeartbeats()
	go n.runHeartbeatLoop()
}

// runHeartbeatLoop periodically fires AppendEntries to all peers as long as
// this node remains the leader. It exits as soon as the node steps down.
//
// This goroutine is spawned by becomeLeader and exits on its own — the leader
// node's Run loop is responsible for calling becomeLeader exactly once per term.
func (n *Node) runHeartbeatLoop() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for range ticker.C {
		n.mu.Lock()
		isLeader := n.role == Leader && n.alive
		n.mu.Unlock()

		if !isLeader {
			return
		}
		n.sendHeartbeats()
	}
}

// sendHeartbeats sends an AppendEntries to every peer. If we have log entries
// the peer hasn't seen yet, they'll be included; otherwise this is an empty
// heartbeat whose only job is to reset the peer's election timer.
func (n *Node) sendHeartbeats() {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.role != Leader {
		return
	}
	for _, peer := range n.peers {
		n.sendAppendEntries(peer)
	}
}

// sendAppendEntries constructs and sends an AppendEntries RPC to one peer.
// Caller must hold n.mu.
func (n *Node) sendAppendEntries(peer int) {
	next := n.nextIndex[peer]
	prevIndex := next - 1
	prevTerm := 0
	if prevIndex > 0 && prevIndex <= len(n.log) {
		prevTerm = n.log[prevIndex-1].Term
	}

	// Collect any entries the peer hasn't replicated yet.
	var entries []LogEntry
	if next <= len(n.log) {
		entries = make([]LogEntry, len(n.log[next-1:]))
		copy(entries, n.log[next-1:])
	}

	// Record the highest index included in this RPC so the reply handler
	// knows how far the peer has gotten if the RPC succeeds.
	n.sentUpTo[peer] = len(n.log)

	n.send(Message{
		From: n.id,
		To:   peer,
		Type: MsgAppendEntries,
		AppendEntries: &AppendEntriesArgs{
			Term:         n.currentTerm,
			LeaderID:     n.id,
			PrevLogIndex: prevIndex,
			PrevLogTerm:  prevTerm,
			Entries:      entries,
			LeaderCommit: n.commitIndex,
		},
	})
}

// SubmitCommand is called by the simulator when a client wants to replicate
// a command. Only the leader can accept it; callers should check IsLeader()
// first and redirect otherwise. Returns false if this node isn't the leader.
func (n *Node) SubmitCommand(cmd string) bool {
	n.mu.Lock()
	defer n.mu.Unlock()

	if n.role != Leader {
		return false
	}

	entry := LogEntry{
		Index:   len(n.log) + 1,
		Term:    n.currentTerm,
		Command: cmd,
	}
	n.log = append(n.log, entry)
	n.notifyChange()

	// Immediately try to replicate to all followers.
	for _, peer := range n.peers {
		n.sendAppendEntries(peer)
	}
	return true
}

// Kill simulates a hard node crash. The node stops processing messages and
// its election timer is stopped so it won't disrupt the cluster while dead.
func (n *Node) Kill() {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.alive = false
	n.electionTimer.Stop()
	n.notifyChange()
}

// Restart brings a killed node back online. It resets to follower state
// (per Raft's assumption that a restarted node has lost all volatile state)
// and starts a fresh election timer.
func (n *Node) Restart() {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.alive = true
	n.role = Follower
	// Don't reset the term or log — those would be on disk in a real system.
	// For this simulator we're treating the in-memory log as "durable enough"
	// to demonstrate the algorithm.
	n.resetElectionTimer()
	n.notifyChange()
}

// IsLeader returns true if this node currently believes it is the leader.
func (n *Node) IsLeader() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.role == Leader && n.alive
}

// Snapshot returns an immutable copy of this node's visible state.
// It acquires mu briefly and is safe to call from any goroutine.
func (n *Node) Snapshot() Snapshot {
	n.mu.Lock()
	defer n.mu.Unlock()

	logCopy := make([]LogEntry, len(n.log))
	copy(logCopy, n.log)

	return Snapshot{
		ID:          n.id,
		Role:        n.role.String(),
		Term:        n.currentTerm,
		Alive:       n.alive,
		VotedFor:    n.votedFor,
		CommitIndex: n.commitIndex,
		LastApplied: n.lastApplied,
		Log:         logCopy,
	}
}

// --- internal helpers (all called with mu held unless noted) ---

// lastLogIndex returns the index of the last entry in the log, or 0 if empty.
func (n *Node) lastLogIndex() int {
	return len(n.log)
}

// lastLogTerm returns the term of the last log entry, or 0 if the log is empty.
func (n *Node) lastLogTerm() int {
	if len(n.log) == 0 {
		return 0
	}
	return n.log[len(n.log)-1].Term
}

// randomElectionTimeout returns a duration uniformly distributed between
// electionTimeoutMin and electionTimeoutMax. The jitter is what prevents
// all nodes from timing out simultaneously and causing split votes.
func (n *Node) randomElectionTimeout() time.Duration {
	spread := int64(electionTimeoutMax - electionTimeoutMin)
	return electionTimeoutMin + time.Duration(rand.Int63n(spread))
}

// resetElectionTimer resets the timer to a new random timeout.
//
// time.Timer.Reset has a documented race: if the timer has already fired and
// the channel hasn't been drained, Reset will not clear the channel, causing
// a spurious wakeup on the next call to Run's select. We drain the channel
// first to prevent that. See the time.Timer docs and the Go issue tracker
// (golang.org/issue/14383) for the full story.
//
// Caller must hold n.mu.
func (n *Node) resetElectionTimer() {
	if !n.electionTimer.Stop() {
		// Stop returned false — the timer already fired. Drain the channel
		// before calling Reset, otherwise the already-queued tick will
		// immediately re-trigger an election after the reset.
		select {
		case <-n.electionTimer.C:
		default:
			// Already drained by the select in Run; nothing to do.
		}
	}
	n.electionTimer.Reset(n.randomElectionTimeout())
}

// notifyChange builds a snapshot and fires the onChange callback.
// Caller must hold n.mu.
func (n *Node) notifyChange() {
	if n.onChange == nil {
		return
	}
	logCopy := make([]LogEntry, len(n.log))
	copy(logCopy, n.log)
	snap := Snapshot{
		ID:          n.id,
		Role:        n.role.String(),
		Term:        n.currentTerm,
		Alive:       n.alive,
		VotedFor:    n.votedFor,
		CommitIndex: n.commitIndex,
		LastApplied: n.lastApplied,
		Log:         logCopy,
	}
	// Call onChange without holding mu — the callback may do I/O or acquire
	// other locks. We've already captured the snapshot above.
	n.mu.Unlock()
	n.onChange(snap)
	n.mu.Lock()
}
