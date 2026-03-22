package raft

// handleAppendEntries processes an incoming AppendEntries RPC (or heartbeat).
//
// This is the most involved handler. The consistency check (prevLogIndex /
// prevLogTerm) is what allows a new leader to repair diverged follower logs:
// the follower rejects until the leader rolls back far enough to find a
// common entry, then overwrites everything after it.
func (n *Node) handleAppendEntries(msg Message) {
	n.mu.Lock()
	defer n.mu.Unlock()

	args := msg.AppendEntries
	n.maybeStepDown(args.Term)

	reply := &AppendEntriesReply{Term: n.currentTerm, Success: false}

	// Reject RPCs from stale leaders — their term is lower than ours.
	if args.Term < n.currentTerm {
		n.send(Message{From: n.id, To: msg.From, Type: MsgAppendEntriesReply, AppendEntriesReply: reply})
		return
	}

	// Hearing from a valid leader: step down if we were a candidate (or,
	// defensively, a stale leader in the same term), and reset our election
	// timer to prevent a premature election.
	if n.role == Leader {
		n.closeHeartbeatStop()
	}
	n.role = Follower
	n.resetElectionTimer()

	// Consistency check: the entry at PrevLogIndex must exist and have the right term.
	// If it doesn't, we can't safely append — there's a gap or divergence before
	// these entries, and the leader needs to send earlier ones first.
	if args.PrevLogIndex > 0 {
		if args.PrevLogIndex > len(n.log) {
			// We don't even have an entry at PrevLogIndex.
			n.send(Message{From: n.id, To: msg.From, Type: MsgAppendEntriesReply, AppendEntriesReply: reply})
			return
		}
		if n.log[args.PrevLogIndex-1].Term != args.PrevLogTerm {
			// We have an entry at that index but it's from a different term —
			// the logs diverged at or before this point.
			n.send(Message{From: n.id, To: msg.From, Type: MsgAppendEntriesReply, AppendEntriesReply: reply})
			return
		}
	}

	// Append new entries, overwriting any conflicting ones. We don't just
	// blindly truncate and append because some entries may already match —
	// only truncate from the first conflict onwards.
	for i, entry := range args.Entries {
		logIdx := args.PrevLogIndex + i + 1 // 1-based log index
		if logIdx <= len(n.log) {
			if n.log[logIdx-1].Term != entry.Term {
				// Conflict: this entry disagrees with what we have.
				// Truncate everything from here on and replace it.
				n.log = n.log[:logIdx-1]
			} else {
				// Entry already matches; skip it.
				continue
			}
		}
		n.log = append(n.log, entry)
	}

	// Advance commitIndex if the leader says something new has been committed.
	if args.LeaderCommit > n.commitIndex {
		// We can only commit up to what we actually have in our log.
		newCommit := args.LeaderCommit
		if lastIdx := n.lastLogIndex(); newCommit > lastIdx {
			newCommit = lastIdx
		}
		n.commitIndex = newCommit
		n.advanceLastApplied()
	}

	reply.Success = true
	reply.MatchIndex = n.lastLogIndex()
	n.notifyChange()
	n.send(Message{From: n.id, To: msg.From, Type: MsgAppendEntriesReply, AppendEntriesReply: reply})
}

// handleAppendEntriesReply processes a follower's response to our AppendEntries.
//
// On success: advance matchIndex and check if we can commit more entries.
// On failure: roll back nextIndex by one and retry — the simple approach from
// the paper. A production system would use a hint from the follower to skip
// back faster (the "nextIndex optimization"), but simplicity wins here.
func (n *Node) handleAppendEntriesReply(msg Message) {
	n.mu.Lock()
	defer n.mu.Unlock()

	reply := msg.AppendEntriesReply
	n.maybeStepDown(reply.Term)

	if n.role != Leader {
		return
	}

	peer := msg.From

	if reply.Success {
		// The follower reports its last log index after applying the entries.
		// Using the reply's MatchIndex (rather than a locally-tracked sentUpTo)
		// eliminates a race when multiple AppendEntries are in flight to the
		// same peer: sentUpTo would be overwritten by the later send, inflating
		// the value seen by the earlier reply's handler.
		if reply.MatchIndex > n.matchIndex[peer] {
			n.matchIndex[peer] = reply.MatchIndex
		}
		n.nextIndex[peer] = n.matchIndex[peer] + 1

		n.maybeAdvanceCommitIndex()
	} else {
		// The consistency check failed. Back off by one and the next heartbeat
		// will retry. Don't go below 1.
		if n.nextIndex[peer] > 1 {
			n.nextIndex[peer]--
		}
	}
}

// maybeAdvanceCommitIndex checks whether we can commit any new log entries.
//
// An entry is committed once a majority of nodes have it in their logs.
// Crucially, a leader may only commit entries from its *current term* —
// never from previous terms directly. This is the subtle rule from Section
// 5.4.2 that prevents the "Figure 8" anomaly in the Raft paper where a
// seemingly committed entry could be overwritten.
//
// Caller must hold n.mu.
func (n *Node) maybeAdvanceCommitIndex() {
	// Walk backwards from the end of our log looking for an entry from the
	// current term that a majority of peers have replicated.
	for idx := n.lastLogIndex(); idx > n.commitIndex; idx-- {
		if n.log[idx-1].Term != n.currentTerm {
			// Don't commit entries from previous terms — see note above.
			continue
		}

		// Count how many nodes (including ourselves) have this entry.
		count := 1 // 1 for ourselves
		for _, peer := range n.peers {
			if n.matchIndex[peer] >= idx {
				count++
			}
		}

		clusterSize := len(n.peers) + 1
		if count >= clusterSize/2+1 {
			n.commitIndex = idx
			n.advanceLastApplied()
			n.notifyChange()
			break
		}
	}
}

// advanceLastApplied moves lastApplied forward to match commitIndex.
// In a real system this is where you'd execute committed commands against
// a state machine. Here we just track the index for UI display.
// Caller must hold n.mu.
func (n *Node) advanceLastApplied() {
	if n.commitIndex > n.lastApplied {
		n.lastApplied = n.commitIndex
	}
}
