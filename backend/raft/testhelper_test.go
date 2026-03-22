package raft

// testCluster wires up N nodes with in-memory channels so we can test the
// full election and replication loop without standing up a simulator or
// WebSocket server.
//
// Each node gets its own goroutine via Run(). The stopCh returned by newTestCluster
// must be closed when the test is done, or the goroutines will outlive the test.

import (
	"sync"
	"testing"
	"time"
)

const testTimeout = 2 * time.Second

type testCluster struct {
	t       *testing.T
	nodes   []*Node
	inboxes []chan Message
	stopCh  chan struct{}
	mu      sync.Mutex

	// partitioned[a][b] == true means messages from a to b are dropped.
	partitioned map[[2]int]bool
}

func newTestCluster(t *testing.T, n int) *testCluster {
	t.Helper()
	tc := &testCluster{
		t:           t,
		nodes:       make([]*Node, n),
		inboxes:     make([]chan Message, n),
		stopCh:      make(chan struct{}),
		partitioned: make(map[[2]int]bool),
	}

	for i := range n {
		tc.inboxes[i] = make(chan Message, 64)
	}

	for i := range n {
		id := i
		peers := make([]int, 0, n-1)
		for j := range n {
			if j != i {
				peers = append(peers, j)
			}
		}

		// Capture tc and id for the closure.
		sendFn := func(msg Message) {
			tc.route(msg)
		}

		tc.nodes[i] = NewNode(id, peers, tc.inboxes[i], sendFn, nil)
	}

	for _, node := range tc.nodes {
		go node.Run(tc.stopCh)
	}

	return tc
}

// route delivers a message to its destination, respecting any partitions.
func (tc *testCluster) route(msg Message) {
	tc.mu.Lock()
	dropped := tc.partitioned[[2]int{msg.From, msg.To}]
	tc.mu.Unlock()

	if dropped {
		return
	}

	select {
	case tc.inboxes[msg.To] <- msg:
	default:
		// Drop the message if the inbox is full rather than blocking.
		// This shouldn't happen in practice with a buffer of 64.
	}
}

func (tc *testCluster) partition(a, b int) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.partitioned[[2]int{a, b}] = true
	tc.partitioned[[2]int{b, a}] = true
}

func (tc *testCluster) heal(a, b int) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	delete(tc.partitioned, [2]int{a, b})
	delete(tc.partitioned, [2]int{b, a})
}

func (tc *testCluster) stop() {
	close(tc.stopCh)
}

// waitForLeader polls until exactly one node is a leader, or the timeout fires.
func (tc *testCluster) waitForLeader(timeout time.Duration) *Node {
	tc.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var leaders []*Node
		for _, n := range tc.nodes {
			if n.IsLeader() {
				leaders = append(leaders, n)
			}
		}
		if len(leaders) == 1 {
			return leaders[0]
		}
		time.Sleep(10 * time.Millisecond)
	}
	tc.t.Fatalf("no leader elected within %v", timeout)
	return nil
}

// waitForCommit polls until node id has commitIndex >= index, or times out.
func (tc *testCluster) waitForCommit(nodeID, index int, timeout time.Duration) {
	tc.t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		snap := tc.nodes[nodeID].Snapshot()
		if snap.CommitIndex >= index {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	snap := tc.nodes[nodeID].Snapshot()
	tc.t.Fatalf("node %d: commitIndex=%d, want >=%d after %v", nodeID, snap.CommitIndex, index, timeout)
}
