package raft

// startElection transitions this node to candidate, increments its term,
// votes for itself, and fires RequestVote RPCs to all peers.
//
// If we're the only node, we'd win immediately, but the simulator always
// starts with at least three nodes so that case doesn't arise here.
func (n *Node) startElection() {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.role = Candidate
	n.currentTerm++
	n.votedFor = n.id // always vote for yourself
	n.votesReceived = map[int]bool{n.id: true}
	n.resetElectionTimer() // restart the timeout in case this election also splits
	n.notifyChange()

	args := RequestVoteArgs{
		Term:         n.currentTerm,
		CandidateID:  n.id,
		LastLogIndex: n.lastLogIndex(),
		LastLogTerm:  n.lastLogTerm(),
	}
	for _, peer := range n.peers {
		n.send(Message{
			From:        n.id,
			To:          peer,
			Type:        MsgRequestVote,
			RequestVote: &args,
		})
	}
}

// handleRequestVote processes an incoming vote request from a candidate.
//
// We grant the vote only if:
//   1. We haven't already voted for someone else this term.
//   2. The candidate's log is at least as up-to-date as ours (Section 5.4.1).
//
// "Up-to-date" means: higher last term, or same last term with an equal or
// longer log. This prevents a candidate that missed entries from winning an
// election and then overwriting committed data.
func (n *Node) handleRequestVote(msg Message) {
	n.mu.Lock()
	defer n.mu.Unlock()

	args := msg.RequestVote
	n.maybeStepDown(args.Term)

	grant := false
	if args.Term >= n.currentTerm &&
		(n.votedFor == -1 || n.votedFor == args.CandidateID) &&
		n.candidateLogUpToDate(args.LastLogIndex, args.LastLogTerm) {
		grant = true
		n.votedFor = args.CandidateID
		// Reset our timer when we grant a vote — treating this the same as
		// hearing from a valid leader prevents us from timing out and starting
		// a competing election against a candidate we just endorsed.
		n.resetElectionTimer()
		n.notifyChange()
	}

	n.send(Message{
		From: n.id,
		To:   msg.From,
		Type: MsgRequestVoteReply,
		RequestVoteReply: &RequestVoteReply{
			Term:        n.currentTerm,
			VoteGranted: grant,
		},
	})
}

// handleRequestVoteReply counts incoming votes for us. If we reach a majority,
// we become leader. If the reply carries a higher term, we step down.
func (n *Node) handleRequestVoteReply(msg Message) {
	n.mu.Lock()
	defer n.mu.Unlock()

	reply := msg.RequestVoteReply
	n.maybeStepDown(reply.Term)

	// Ignore stale replies — we may have already won, stepped down, or moved
	// to a newer term by the time this reply arrives.
	if n.role != Candidate {
		return
	}

	if reply.VoteGranted {
		n.votesReceived[msg.From] = true
	}

	// +1 to include ourselves; peers is everyone else.
	clusterSize := len(n.peers) + 1
	majority := clusterSize/2 + 1

	if len(n.votesReceived) >= majority {
		// becomeLeader expects mu to be held — the defer at the top of this
		// function takes care of the final unlock.
		n.becomeLeader()
	}
}

// candidateLogUpToDate returns true if a candidate with the given last log
// index and term is at least as up-to-date as this node's log.
//
// The comparison is: first compare terms of the last entries; if equal,
// the longer log wins. This is Section 5.4.1 of the Raft paper verbatim.
// Caller must hold n.mu.
func (n *Node) candidateLogUpToDate(lastIndex, lastTerm int) bool {
	myLastTerm := n.lastLogTerm()
	myLastIndex := n.lastLogIndex()

	if lastTerm != myLastTerm {
		return lastTerm > myLastTerm
	}
	return lastIndex >= myLastIndex
}
