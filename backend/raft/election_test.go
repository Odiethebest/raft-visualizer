package raft

import (
	"testing"
	"time"
)

// TestElectsLeader verifies that a fresh 3-node cluster always elects exactly
// one leader within a reasonable time. This is the most basic liveness property.
func TestElectsLeader(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	snap := leader.Snapshot()

	if snap.Role != "leader" {
		t.Errorf("expected role=leader, got %q", snap.Role)
	}
	if snap.Term < 1 {
		t.Errorf("expected term >= 1, got %d", snap.Term)
	}
}

// TestSingleLeaderAtATime verifies that after a leader is elected, there is
// never more than one concurrent leader across the cluster. We run this for a
// short interval to catch any flapping.
func TestSingleLeaderAtATime(t *testing.T) {
	tc := newTestCluster(t, 5)
	defer tc.stop()

	tc.waitForLeader(testTimeout)

	// Poll for a while and assert we never see two leaders simultaneously.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		var leaders []int
		for _, n := range tc.nodes {
			if n.IsLeader() {
				snap := n.Snapshot()
				leaders = append(leaders, snap.ID)
			}
		}
		if len(leaders) > 1 {
			t.Fatalf("multiple leaders at the same time: nodes %v", leaders)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// TestLeaderReelectionAfterKill verifies that if we kill the current leader,
// the remaining nodes elect a new one. This is the core failure-recovery path.
func TestLeaderReelectionAfterKill(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	oldLeaderID := leader.Snapshot().ID
	oldTerm := leader.Snapshot().Term

	leader.Kill()

	// Wait for a new leader among the surviving nodes.
	deadline := time.Now().Add(testTimeout)
	var newLeader *Node
	for time.Now().Before(deadline) {
		for _, n := range tc.nodes {
			if n.Snapshot().ID != oldLeaderID && n.IsLeader() {
				newLeader = n
				break
			}
		}
		if newLeader != nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if newLeader == nil {
		t.Fatal("no new leader elected after killing the old one")
	}
	if newLeader.Snapshot().Term <= oldTerm {
		t.Errorf("new leader term %d should be > old term %d", newLeader.Snapshot().Term, oldTerm)
	}
}

// TestNoLeaderWithoutQuorum verifies that a single surviving node cannot elect
// itself leader. We kill the current leader plus one follower, leaving a lone
// survivor that lacks the majority (2 of 3) needed for election.
func TestNoLeaderWithoutQuorum(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	leaderID := leader.Snapshot().ID

	// Kill the leader and one other node, leaving exactly one survivor.
	for _, n := range tc.nodes {
		if n.Snapshot().ID != leaderID {
			// Kill one follower and the leader — two kills total.
			n.Kill()
			leader.Kill()
			break
		}
	}

	// Give the survivor long enough to fire several election timeouts.
	// With 500–800ms timeouts this covers at least 3 full cycles.
	time.Sleep(2500 * time.Millisecond)

	for _, n := range tc.nodes {
		if n.IsLeader() {
			t.Errorf("node %d became leader without a quorum — that should not be possible", n.Snapshot().ID)
		}
	}
}

// TestCandidateLogUpToDate unit-tests the log comparison logic directly.
// This is the rule from Section 5.4.1: a voter rejects candidates whose log
// is less up-to-date than its own.
func TestCandidateLogUpToDate(t *testing.T) {
	n := &Node{
		log: []LogEntry{
			{Index: 1, Term: 1},
			{Index: 2, Term: 2},
		},
	}

	cases := []struct {
		lastIdx  int
		lastTerm int
		want     bool
		desc     string
	}{
		{2, 2, true, "equal log — should grant"},
		{3, 2, true, "longer log same term — should grant"},
		{2, 3, true, "higher term shorter log — should grant"},
		{1, 2, false, "shorter log same term — should deny"},
		{2, 1, false, "lower term — should deny"},
	}

	for _, c := range cases {
		got := n.candidateLogUpToDate(c.lastIdx, c.lastTerm)
		if got != c.want {
			t.Errorf("%s: candidateLogUpToDate(%d,%d) = %v, want %v",
				c.desc, c.lastIdx, c.lastTerm, got, c.want)
		}
	}
}
