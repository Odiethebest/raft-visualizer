package raft

import (
	"testing"
	"time"
)

// TestLogReplication verifies that a command submitted to the leader gets
// replicated to all followers and eventually committed cluster-wide.
func TestLogReplication(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)

	ok := leader.SubmitCommand("set x=1")
	if !ok {
		t.Fatal("SubmitCommand returned false on the current leader")
	}

	leaderID := leader.Snapshot().ID

	// All nodes should commit the entry within a reasonable time.
	for _, n := range tc.nodes {
		snap := n.Snapshot()
		tc.waitForCommit(snap.ID, 1, testTimeout)
	}

	// Verify the log entry content on the leader.
	snap := tc.nodes[leaderID].Snapshot()
	if len(snap.Log) < 1 {
		t.Fatal("leader log is empty after SubmitCommand")
	}
	if snap.Log[0].Command != "set x=1" {
		t.Errorf("log[0].Command = %q, want %q", snap.Log[0].Command, "set x=1")
	}
}

// TestReplicationWithSingleNodeFailure verifies that we can still commit when
// one out of three followers is down. Majority = 2, and the leader + 1 survivor
// is enough.
func TestReplicationWithSingleNodeFailure(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	leaderID := leader.Snapshot().ID

	// Kill one follower.
	for _, n := range tc.nodes {
		if n.Snapshot().ID != leaderID {
			n.Kill()
			break
		}
	}

	ok := leader.SubmitCommand("set y=2")
	if !ok {
		t.Fatal("SubmitCommand returned false")
	}

	// Leader and the surviving follower must commit.
	for _, n := range tc.nodes {
		snap := n.Snapshot()
		if !snap.Alive {
			continue
		}
		tc.waitForCommit(snap.ID, 1, testTimeout)
	}
}

// TestNoCommitWithoutQuorum verifies that a partitioned leader cannot commit
// new entries when it can't reach a majority. The leader can still append to
// its own log, but commitIndex must not advance.
func TestNoCommitWithoutQuorum(t *testing.T) {
	tc := newTestCluster(t, 5)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	leaderID := leader.Snapshot().ID

	// Partition the leader away from all followers.
	for _, n := range tc.nodes {
		if n.Snapshot().ID != leaderID {
			tc.partition(leaderID, n.Snapshot().ID)
		}
	}

	// Give the leader time to try (and fail) to replicate.
	time.Sleep(300 * time.Millisecond)

	leader.SubmitCommand("set z=3")
	time.Sleep(300 * time.Millisecond)

	snap := leader.Snapshot()
	if snap.CommitIndex > 0 {
		t.Errorf("partitioned leader committed an entry (commitIndex=%d) without quorum", snap.CommitIndex)
	}
}

// TestLogDivergenceRepair verifies that after a partition heals, a rejoining
// node with a stale log catches up correctly.
func TestLogDivergenceRepair(t *testing.T) {
	tc := newTestCluster(t, 3)
	defer tc.stop()

	leader := tc.waitForLeader(testTimeout)
	leaderID := leader.Snapshot().ID

	// Find a follower and partition it away.
	var stalePeer *Node
	for _, n := range tc.nodes {
		if n.Snapshot().ID != leaderID {
			stalePeer = n
			break
		}
	}
	stalePeerID := stalePeer.Snapshot().ID
	tc.partition(leaderID, stalePeerID)

	// Replicate two entries while the peer is isolated.
	leader.SubmitCommand("cmd1")
	leader.SubmitCommand("cmd2")

	// Wait for the entries to commit on the non-isolated nodes.
	for _, n := range tc.nodes {
		if n.Snapshot().ID == stalePeerID {
			continue
		}
		tc.waitForCommit(n.Snapshot().ID, 2, testTimeout)
	}

	// Heal the partition — the stale peer should now catch up.
	tc.heal(leaderID, stalePeerID)
	tc.waitForCommit(stalePeerID, 2, testTimeout)

	// Verify the entries match.
	snap := stalePeer.Snapshot()
	if len(snap.Log) < 2 {
		t.Fatalf("stale peer log has %d entries after repair, want >= 2", len(snap.Log))
	}
	if snap.Log[0].Command != "cmd1" || snap.Log[1].Command != "cmd2" {
		t.Errorf("unexpected log contents after repair: %+v", snap.Log)
	}
}
