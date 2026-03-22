// Package raft implements the core Raft consensus protocol. It has no
// knowledge of networking, WebSocket, or the simulator layer — just the
// state machine. This makes it independently testable.
package raft

// Role represents the three states a Raft node can be in at any point.
// The transitions are one-directional in terms of authority: you can always
// fall back to follower, but becoming leader requires winning an election.
type Role int

const (
	Follower  Role = iota
	Candidate      // running for election, waiting for votes
	Leader         // currently authoritative; sends heartbeats to suppress elections
)

func (r Role) String() string {
	switch r {
	case Follower:
		return "follower"
	case Candidate:
		return "candidate"
	case Leader:
		return "leader"
	default:
		return "unknown"
	}
}

// LogEntry is one command in the replicated log. The term it was received in
// is stored alongside the command so that leaders can detect log divergence
// during AppendEntries consistency checks.
type LogEntry struct {
	Index   int    `json:"index"`
	Term    int    `json:"term"`
	Command string `json:"command"`
}

// RequestVoteArgs is sent by a candidate to each peer during an election.
// The candidate has to convince peers that its log is at least as up-to-date
// as theirs — otherwise a node with more committed entries could be
// overwritten by a freshly-started candidate.
type RequestVoteArgs struct {
	Term         int // candidate's current term
	CandidateID  int // who's asking
	LastLogIndex int // index of the candidate's last log entry
	LastLogTerm  int // term of that entry
}

// RequestVoteReply carries the peer's decision. If VoteGranted is false,
// Term may be higher than the candidate's — in that case the candidate must
// step down immediately and update its own term.
type RequestVoteReply struct {
	Term        int  // peer's current term, so the candidate can update itself
	VoteGranted bool // true iff the peer voted for this candidate
}

// AppendEntriesArgs serves double duty: it carries log entries during
// replication, and it's also sent as an empty heartbeat (Entries == nil)
// to reset follower election timers. The Raft paper uses the same RPC for
// both to reduce the surface area of the protocol.
type AppendEntriesArgs struct {
	Term         int        // leader's current term
	LeaderID     int        // so followers can redirect clients
	PrevLogIndex int        // index of the entry immediately preceding Entries
	PrevLogTerm  int        // term of that entry — used for the consistency check
	Entries      []LogEntry // empty for heartbeat; one or more for replication
	LeaderCommit int        // leader's commitIndex, so followers can advance theirs
}

// AppendEntriesReply lets the leader know whether the follower accepted the
// entries. On rejection, the leader must roll back its nextIndex for that
// follower and retry with earlier entries. The paper's approach is to
// decrement by one each time; we take the same simple approach here.
type AppendEntriesReply struct {
	Term    int  // follower's current term, in case the leader is stale
	Success bool // true iff the follower's consistency check passed
}

// RPCType identifies which RPC a Message is carrying. Using an enum here
// (rather than interface{} or separate channels) keeps the message bus
// simple: one channel per node, one type switch on receive.
type RPCType int

const (
	MsgRequestVote      RPCType = iota
	MsgRequestVoteReply         // reply routed back to the original sender
	MsgAppendEntries
	MsgAppendEntriesReply
)

// Message is the envelope that travels over the in-process message bus.
// From and To are node IDs. The RPC payload is in one of the four fields
// below — exactly one should be non-nil for a given Type.
//
// Using a single struct instead of a union keeps channel types simple
// (chan Message instead of chan interface{}), at the cost of some extra
// memory per message. For a simulator with at most a handful of nodes this
// is a fine trade-off.
type Message struct {
	From int
	To   int
	Type RPCType

	RequestVote       *RequestVoteArgs
	RequestVoteReply  *RequestVoteReply
	AppendEntries     *AppendEntriesArgs
	AppendEntriesReply *AppendEntriesReply
}

// Snapshot is an immutable point-in-time view of a single node's state,
// safe to hand off to the WebSocket layer without holding any node locks.
// This is what gets serialized and sent to the frontend.
type Snapshot struct {
	ID          int        `json:"id"`
	Role        string     `json:"role"`
	Term        int        `json:"term"`
	Alive       bool       `json:"alive"`
	VotedFor    int        `json:"votedFor"`    // -1 means no vote cast this term
	CommitIndex int        `json:"commitIndex"`
	LastApplied int        `json:"lastApplied"`
	Log         []LogEntry `json:"log"`
}
