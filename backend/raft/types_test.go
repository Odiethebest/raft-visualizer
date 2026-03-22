package raft

import "testing"

func TestRoleString(t *testing.T) {
	cases := []struct {
		role Role
		want string
	}{
		{Follower, "follower"},
		{Candidate, "candidate"},
		{Leader, "leader"},
		{Role(99), "unknown"},
	}
	for _, c := range cases {
		if got := c.role.String(); got != c.want {
			t.Errorf("Role(%d).String() = %q, want %q", c.role, got, c.want)
		}
	}
}

func TestMessageFields(t *testing.T) {
	// Sanity check that the Message struct carries RPC payloads correctly.
	// This is deliberately simple — the real logic tests live in election_test.go
	// and replication_test.go; this just verifies the type plumbing compiles and
	// works as expected.
	rv := &RequestVoteArgs{Term: 2, CandidateID: 1, LastLogIndex: 3, LastLogTerm: 2}
	msg := Message{
		From:        1,
		To:          2,
		Type:        MsgRequestVote,
		RequestVote: rv,
	}

	if msg.RequestVote.Term != 2 {
		t.Errorf("expected Term=2, got %d", msg.RequestVote.Term)
	}
	if msg.AppendEntries != nil {
		t.Error("expected AppendEntries to be nil for a RequestVote message")
	}
}

func TestSnapshotVotedForSentinel(t *testing.T) {
	// VotedFor == -1 is the "no vote cast" sentinel; make sure it round-trips.
	snap := Snapshot{ID: 0, VotedFor: -1}
	if snap.VotedFor != -1 {
		t.Errorf("expected VotedFor=-1, got %d", snap.VotedFor)
	}
}
