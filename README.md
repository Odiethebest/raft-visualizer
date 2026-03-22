# Raft Consensus Visualizer
**By Odie Yang**

An interactive, real-time visualization of the Raft distributed consensus algorithm. Built to make the mechanics of leader election and log replication observable — not just readable in a paper.

## Motivation

Raft is designed to be understandable, yet its behavior under failure is notoriously difficult to reason about without watching it unfold. Most learning resources describe the algorithm statically. This project treats the running cluster as the primary artifact: every state transition, every vote grant, every heartbeat timeout is surfaced as it happens, with the ability to inject faults mid-run and observe how the system recovers.

This is also a deliberate exercise in Go — specifically in modeling concurrent, communicating state machines using goroutines and channels, which is the idiomatic way to think about distributed nodes in the language.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Go Backend                           │
│                                                             │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐                │
│   │  Node 0  │   │  Node 1  │   │  Node 2  │  goroutines    │
│   │  (state  │   │  (state  │   │  (state  │                │ 
│   │  machine)│   │  machine)│   │  machine)│                │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘                │
│        │              │              │                      │
│        └──────────────┴──────────────┘                      │
│                       │                                     │
│               simulator/cluster                             │
│          (event aggregation + fault injection)              │
│                       │                                     │
│                  ws/hub.go                                  │
│            (broadcast to all WS clients)                    │
└───────────────────────┬─────────────────────────────────────┘
                        │  WebSocket (JSON events)
┌───────────────────────┴─────────────────────────────────────┐
│                     React Frontend                          │
│                                                             │
│   useRaftWS() ──► clusterStore (Zustand)                    │
│                       │                                     │
│         ┌─────────────┼─────────────┐                       │
│         │             │             │                       │
│   ClusterView    LogPanel     ControlPanel                  │
│  (node graph,   (per-node    (kill node,                    │
│   msg anim.)    log entries)  partition)                    │
└─────────────────────────────────────────────────────────────┘
```

The backend models each Raft node as an independent goroutine with its own election timer, log, and volatile state. Nodes communicate through an in-process message bus (rather than actual TCP) to keep the focus on Raft semantics rather than networking boilerplate. The cluster coordinator aggregates state snapshots and publishes them over WebSocket after each meaningful transition.

The frontend maintains a local mirror of cluster state via Zustand and re-renders incrementally — only nodes and log entries that actually changed trigger component updates.

## What's Implemented

**Leader Election**

- Randomized election timeouts per node (150–300ms, per the Raft paper)
- RequestVote RPC with term comparison and vote deduplication
- Split vote detection and re-election
- Heartbeat suppression of follower timeouts

**Log Replication**

- Client command submission routed to the current leader
- AppendEntries RPC with prevLogIndex / prevLogTerm consistency check
- Majority-based commit index advancement
- Log divergence repair (nextIndex rollback on rejection)

**Fault Injection**

- Hard node kill (simulates process crash; node drops all incoming messages)
- Network partition (bidirectional message drop between specified node subsets)
- Heal partition / restart node

**Observability**

- Per-node state panel: current role, term, votedFor, commitIndex, lastApplied
- Log entries with commit status highlighted per node
- In-flight RPC animation on the cluster graph (vote requests, heartbeats, append entries)
- Event timeline log with timestamps

## Technical Notes

**Why goroutines over actual sockets**

Using real TCP between nodes would add significant non-Raft complexity (connection management, retry logic, serialization) that obscures what the project is actually demonstrating. The in-process message bus gives the same concurrency semantics — goroutines block on channel receives exactly as a real node would block waiting for a network response — while keeping the Raft logic isolated and testable.

**Timer management in Go**

Each node owns a `time.Timer` for its election timeout, reset on every valid heartbeat or AppendEntries receipt. The subtle correctness issue here is that `timer.Reset()` has a documented race if the timer channel has already fired and not been drained. The implementation handles this explicitly, which turns out to be a non-trivial detail that the Raft paper glosses over entirely.

**WebSocket event design**

Rather than streaming a full cluster snapshot on every internal tick, the backend only emits events on state transitions (role change, term increment, log append, commit advance). This keeps the WebSocket traffic proportional to what's actually happening, and forces a clean separation between the simulation loop and the presentation layer.

**Frontend state management**

Zustand was chosen over Redux for its minimal boilerplate and direct store mutation model, which maps cleanly onto the "apply delta event" pattern used here. Each incoming WebSocket message is a partial update keyed by node ID; the store merges it into the existing cluster snapshot rather than replacing the whole structure.

## Project Structure

```
raft-visualizer/
├── backend/
│   ├── main.go
│   ├── raft/
│   │   ├── types.go          # NodeState, LogEntry, RPC message types
│   │   ├── node.go           # Core state machine loop
│   │   ├── election.go       # RequestVote handling
│   │   └── replication.go    # AppendEntries handling
│   ├── simulator/
│   │   └── cluster.go        # Node lifecycle, message routing, fault injection
│   └── ws/
│       ├── hub.go            # Client registry, broadcast
│       └── handler.go        # HTTP → WebSocket upgrade
│
├── frontend/
│   └── src/
│       ├── hooks/useRaftWS.js
│       ├── store/clusterStore.js
│       └── components/
│           ├── ClusterView.jsx
│           ├── NodeCard.jsx
│           ├── LogPanel.jsx
│           └── ControlPanel.jsx
│
└── docker-compose.yml
```

## Running Locally

**Prerequisites:** Go 1.22+, Node 18+

```bash
# Backend
cd backend
go mod download
go run main.go
# Starts on :8080

# Frontend
cd frontend
npm install
npm run dev
# Starts on :5173
```

Or with Docker:

```bash
docker-compose up
```

Open `http://localhost:5173`. The cluster initializes with five nodes. Give it a few seconds to elect a leader, then start breaking things.

## WebSocket Protocol

All messages follow this envelope:

```json
{
  "type": "STATE_UPDATE | COMMAND_ACK | ERROR",
  "payload": { ... }
}
```

**STATE_UPDATE** (server → client):
```json
{
  "type": "STATE_UPDATE",
  "payload": {
    "nodes": [
      {
        "id": 0,
        "role": "leader",
        "term": 3,
        "alive": true,
        "votedFor": -1,
        "commitIndex": 4,
        "log": [
          { "index": 1, "term": 1, "command": "set x=1", "committed": true },
          { "index": 2, "term": 2, "command": "set y=7", "committed": true }
        ]
      }
    ],
    "inFlight": [
      { "from": 0, "to": 2, "type": "AppendEntries", "term": 3 }
    ]
  }
}
```

**FAULT_INJECT** (client → server):
```json
{
  "type": "FAULT_INJECT",
  "payload": {
    "action": "kill | partition | heal | restart",
    "targets": [1],
    "partitionGroups": [[0, 1], [2, 3, 4]]
  }
}
```

## What This Is Not

This is a simulation for learning and demonstration purposes. It deliberately omits:

- **Persistence** — Raft requires stable storage for `currentTerm`, `votedFor`, and log entries to survive crashes. This implementation holds all state in memory.
- **Membership changes** — Joint consensus for cluster reconfiguration (Section 6 of the paper) is not implemented.
- **Log compaction / snapshotting** — Logs grow unboundedly in this implementation.
- **Pre-vote extension** — The optimization that prevents disruptive elections from partitioned nodes is not included.

These are known, intentional omissions. The goal is a correct and observable implementation of the core protocol, not a production-grade consensus library.

## References

- Ongaro, D., & Ousterhout, J. (2014). *In Search of an Understandable Consensus Algorithm (Extended Version)*. USENIX ATC.
- [The Raft Website](https://raft.github.io/) — visualization reference and TLA+ spec
- [etcd/raft](https://github.com/etcd-io/etcd/tree/main/raft) — production Go implementation used as a design reference