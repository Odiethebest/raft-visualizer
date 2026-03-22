# Raft Visualizer Backend

This backend runs an in-process Raft cluster simulation and streams live state
to the frontend via WebSocket.

It is designed for **observability and learning**, not production deployment.

## What This Service Does

- boots a 5-node Raft cluster (`main.go`)
- simulates message routing, partitions, crashes, and restarts (`simulator/`)
- runs Raft election + replication logic (`raft/`)
- broadcasts cluster snapshots over WebSocket (`ws/`)
- accepts fault injection commands from connected clients (`FAULT_INJECT`)

## Runtime Endpoints

- `GET /health` -> `200 OK` (basic liveness)
- `GET /ws` -> WebSocket upgrade endpoint
- `GET /` -> frontend static assets when `STATIC_DIR` is configured

Listen address:

- default: `:8080`
- cloud/platform: `:$PORT` when `PORT` is set

## High-Level Architecture

```text
main.go
  ├─ ws.NewHub()
  ├─ simulator.New(clusterSize, onStateChange -> hub.Broadcast)
  ├─ go faultLoop(cluster, hub)
  └─ http handlers: /ws, /health, optional static SPA (/)

raft/Node goroutines
  ├─ run election timers
  ├─ handle RequestVote / AppendEntries RPCs
  └─ notify simulator on state changes

simulator/Cluster
  ├─ routes in-process RPC messages
  ├─ applies fault injection (kill/restart/partition/heal/submit)
  ├─ tracks in-flight messages for UI animation
  └─ emits throttled snapshots to ws.Hub

ws/Hub + handler
  ├─ upgrades HTTP -> WebSocket
  ├─ read pump parses FAULT_INJECT -> hub.FaultCh
  └─ write pump broadcasts STATE_UPDATE + ping keepalive
```

## Package Breakdown

### `raft/`
Core Raft state machine:

- roles: `Follower`, `Candidate`, `Leader`
- leader election (`election.go`)
- log replication + commit advancement (`replication.go`)
- node lifecycle (`node.go`)
- protocol/message types (`types.go`)

Notable implementation details:

- randomized election timeout (`500–800ms`)
- heartbeat interval (`50ms`)
- leader heartbeat goroutine lifecycle is explicitly managed (`heartbeatStop`)
- replication confirmations use follower-reported `MatchIndex` to avoid
  in-flight reply races

### `simulator/`
Cluster orchestration around Raft nodes:

- allocates node mailboxes and routes messages
- supports fault injection:
  - kill node
  - restart node
  - network partition / heal
  - submit command to current leader
- builds `ClusterSnapshot` for UI
- throttles snapshot emission (`snapshotInterval = 50ms`)
- prunes and bounds in-flight messages (`TTL + maxInFlight`)

### `ws/`
WebSocket transport layer:

- connection upgrade and read/write pumps
- connected client registry + fan-out broadcast
- incoming command parsing (`Envelope` + `FaultPayload`)
- ping/pong keepalive and close handling

## WebSocket Protocol

Envelope format:

```json
{
  "type": "STATE_UPDATE | FAULT_INJECT",
  "payload": {}
}
```

### Server -> Client (`STATE_UPDATE`)

`payload` shape:

```json
{
  "nodes": [
    {
      "id": 0,
      "role": "leader",
      "term": 3,
      "alive": true,
      "votedFor": -1,
      "commitIndex": 4,
      "lastApplied": 4,
      "log": []
    }
  ],
  "inFlight": [
    { "from": 0, "to": 1, "type": "AppendEntries", "term": 3 }
  ]
}
```

### Client -> Server (`FAULT_INJECT`)

`payload` shape:

```json
{
  "action": "kill | restart | partition | heal | submit",
  "targets": [1],
  "partitionGroups": [[0,1], [2,3,4]],
  "command": "set x=1"
}
```

## Local Development

From `backend/`:

```bash
go mod download
go run main.go
```

Service starts on `http://localhost:8080`.

## Testing

Run all backend tests:

```bash
go test ./...
```

Test coverage includes:

- Raft election correctness and re-election behavior
- replication, quorum rules, and log divergence repair
- simulator fault injection and snapshot behavior
- WebSocket broadcast/fan-out and fault message routing

## Concurrency Notes

- Each Raft node runs in its own goroutine.
- Message passing between nodes is channel-based (in-process bus).
- Simulator and WS hub use locks for shared structures (`sync.Mutex`).
- Snapshot emission is decoupled via a dedicated snapshot loop to avoid
  blocking node run loops with expensive serialization/broadcast work.

## Current Scope / Known Limitations

This implementation intentionally omits several production concerns:

- no persistent storage of term/vote/log
- no membership changes (joint consensus)
- no log compaction/snapshots
- no advanced network realism (latency models, packet reordering, etc.)

The goal is a clear, debuggable Raft simulation for visualization.
