# Raft Consensus — A Plain-English Guide

This document explains what Raft does, why it exists, and how to use
the visualizer to watch it happen in real time. No PhD required.

---

## The Problem Raft Solves

Imagine you're building a database. To survive server crashes, you run
three copies of it on three different machines. A client writes `x = 1`
to one machine. How do you make sure the other two machines also have
`x = 1` — especially when any machine can crash at any moment, and
messages between machines can arrive late or out of order?

This is the **distributed consensus** problem: how do a group of servers
agree on a single sequence of events, even when some of them are broken
or unreachable?

Raft is one answer. Its design principle is *understandability* — the
authors wrote it specifically because the previous gold standard (Paxos)
was notoriously hard to reason about.

---

## The Cast

A Raft cluster is a group of servers (this visualizer uses 5). Each
server is always in exactly one of three states:

| State | What it means |
|-------|---------------|
| **Follower** | Passive. Waits for instructions. This is every server's starting state. |
| **Candidate** | Actively trying to become the leader. A follower becomes a candidate when it stops hearing from the current leader. |
| **Leader** | The one in charge. All writes go through the leader; it replicates them to followers. There is at most one leader at a time. |

---

## Part 1: Leader Election

**The core idea:** if no one is in charge, hold an election.

Every follower has an *election timeout* — a randomly chosen timer
between 150ms and 300ms. If a follower doesn't hear from a leader before
the timer fires, it assumes the leader is dead and starts an election.

Here's how an election works:

1. The follower increments its *term* (a monotonically increasing round
   counter) and switches to **Candidate**.
2. It votes for itself and sends a `RequestVote` message to every other
   server.
3. Each server that hasn't voted yet in this term votes for the
   candidate — but only if the candidate's log is at least as up-to-date
   as its own.
4. If the candidate collects votes from a **majority** (3 out of 5), it
   becomes **Leader**.
5. The new leader immediately sends heartbeats to everyone, which resets
   their election timers and prevents new elections.

**Why random timeouts?** If all five servers had the same timeout, they'd
all call an election simultaneously and split the votes every time. With
random timeouts, one server almost always times out first, gets its votes
in, and wins before anyone else even starts campaigning.

**What "term" means:** Terms are like numbered presidential terms. If a
server ever sees a message with a higher term than its own, it knows it's
behind and immediately steps down to follower. This prevents stale leaders
from causing trouble after they've been replaced.

---

## Part 2: Log Replication

**The core idea:** the leader is the single source of truth. All writes
flow through it, and it replicates them to followers before confirming
success.

When a client sends a command (say, `set x = 1`):

1. The leader appends the command to its own log as a new *entry*.
2. The leader sends `AppendEntries` to every follower, containing the
   new entry and a *consistency check* (the index and term of the entry
   right before this one).
3. Each follower runs the consistency check. If it passes, the follower
   appends the entry to its own log and replies "success." If it fails
   (because there's a gap or a conflicting entry), the follower replies
   "failure" and the leader backs up and tries again with earlier entries.
4. Once a **majority** of servers have logged the entry, the leader marks
   it as *committed* and notifies followers on the next heartbeat.

The consistency check is why Raft is safe: a follower will never accept
an entry that creates a gap or contradiction in its history. A leader
that wins an election always has all committed entries, so committed data
is never lost.

---

## Part 3: Handling Failures

Raft tolerates up to **⌊(n−1)/2⌋ simultaneous failures** — for a
5-node cluster, that's 2.

**A follower crashes:**
The leader keeps sending `AppendEntries`. When the follower comes back,
the consistency check fails at first; the leader walks backward until it
finds the last matching entry and sends everything the follower missed.
The follower catches up automatically.

**The leader crashes:**
Followers stop receiving heartbeats. One of them times out, starts an
election, and a new leader is elected within one or two election timeouts
(roughly 150–600ms). The new leader has all committed entries because
only servers with up-to-date logs can win elections.

**A network partition:**
Say the cluster splits into two groups that can't talk to each other.
The smaller group can't reach a majority, so it cannot commit anything —
it might elect a candidate that stays stuck in that state, but nothing
gets written. The larger group (if it has a majority) continues normally.
When the partition heals, the nodes in the smaller group catch up from
the winner and any conflicting uncommitted entries are overwritten.

---

## Using the Visualizer

The visualizer runs the full Raft protocol across 5 goroutines connected
by an in-process message bus. The frontend mirrors their state in real
time over WebSocket.

### Reading the cluster graph

- **Solid dark circle** — this node is the current leader.
- **White circle, solid border** — follower, alive and healthy.
- **White circle, dashed border** — candidate mid-election.
- **Faded circle, dashed border** — node is dead (simulated crash).
- **Moving dots on the lines** — in-flight RPCs. Darker dots are election
  messages (RequestVote); lighter dots are replication/heartbeat
  (AppendEntries).

The number inside each circle is the node's ID. The small label below it
shows the current term (`t3` means term 3, `dead` means the node is down).

### Reading the right panel

Click any node to select it. The right panel shows:

- **role / term / commit / voted for** — the node's current volatile state.
  `voted for: —` means it hasn't voted in this term yet.
- **log entries** — each entry shows its index, the term it was written
  in, and the command. A green dot means committed; gray means pending
  (the leader hasn't confirmed majority replication yet).
- **event stream** — role changes, kills, and new commits, newest first.

### Injecting faults

Use the control bar at the bottom of the canvas:

**Submit cmd**
Sends a command to the current leader, which appends it to its log and
replicates it. Watch the pending (gray) dot turn green once a majority
confirms it. Try submitting commands rapidly — you'll see the log on
each node filling up at slightly different rates.

**Kill node**
Simulates a hard crash. The node stops processing all messages. If you
kill the leader, watch the remaining nodes hold an election. If you kill
two nodes in a 5-node cluster, the remaining three can still form a
majority and keep running.

**Restart**
Brings a dead node back as a follower. Watch it receive a burst of
`AppendEntries` as the leader sends it everything it missed. The log on
the restarted node catches up within a few heartbeat cycles.

**Partition**
Splits the cluster into two groups that can't talk to each other. You
pick which nodes go in Group A and which go in Group B. Try putting the
leader in the minority (Group A = leader only, Group B = the other four):
the majority side will elect a new leader; the isolated old leader will
stay stuck as a leader for a moment then step down when the partition heals
and it sees a higher term.

**Heal**
Removes all partitions. Isolated nodes reconnect and start catching up.

### Suggested experiments

1. **Watch a normal election.**
   Refresh the page and do nothing. Within ~300ms, one node will time out,
   call an election, and win. Watch the term numbers increment in the header.

2. **Kill the leader.**
   Click Kill Node → select the leader. Count how long the re-election takes.
   Try to kill the new leader right after it's elected — can you prevent
   the cluster from settling?

3. **Fill the log, then partition.**
   Submit five commands. Then partition the leader away from the rest.
   Notice that the leader's uncommitted entries (if any) don't show as
   committed on the majority side — a new leader on the majority side
   takes over and the old entries stay in limbo until the partition heals.

4. **Minority partition.**
   Partition two nodes away from the other three. Submit a command. The
   three-node side commits it. Then heal and watch the two isolated nodes
   catch up. Their logs will match the majority — Raft ensures diverged
   followers are repaired, not the other way around.

---

## A Few Things to Keep in Mind

**This is a simulation.** The "network" here is an in-process Go channel
bus, not real TCP. The delays you see come from timers, not latency.
The protocol behavior is correct; the performance numbers are not
representative of a real deployment.

**No persistence.** A production Raft implementation writes `currentTerm`,
`votedFor`, and log entries to stable storage before responding to any
RPC. This implementation keeps everything in memory — a "crashed" node
remembers its log when it restarts, which is a simplification.

**No log compaction.** Logs grow forever here. A real system would take
snapshots and truncate the log to avoid running out of disk space.

These are intentional omissions. The goal is to make the core protocol
visible, not to ship a production database.
