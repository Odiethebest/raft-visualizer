# Raft Visualizer

An interactive Raft consensus simulator focused on one goal: make distributed consensus behavior observable under failure, not just theoretically correct on paper.

This project started during **CS6650 (Distributed Systems)**. The course made one gap obvious: reading Raft is not the same as watching elections, replication, and partitions evolve in real time. This repository is my attempt to close that gap while also serving as my first serious hands-on exploration of **Go concurrency**.

## Why This Repository Is Worth Opening

Most Raft introductions are static. Real systems are dynamic:

- leaders fail at inconvenient moments,
- followers drift and recover,
- quorum boundaries decide what is safe to commit.

This simulator turns those dynamics into a live system you can stress, break, and inspect.

## Raft in 5 Minutes (Practitioner Version)

### 1. What problem Raft solves
Raft solves **distributed consensus**: multiple nodes must agree on one ordered log of commands despite crashes, delays, and partitions.

### 2. Core model
Each node is always one of:

- **Follower**: passive, receives replication and heartbeats.
- **Candidate**: requests votes to become leader.
- **Leader**: the single writer for the current term.

Time is organized into monotonically increasing **terms**. A node that sees a higher term steps down immediately, which prevents stale leaders from persisting.

### 3. Leader election
- A follower that misses heartbeats hits an election timeout and becomes candidate.
- It increments term, votes for itself, and sends `RequestVote`.
- Majority quorum wins the election.
- Winner becomes leader and starts heartbeats (`AppendEntries`) to suppress new elections.

Randomized election timeouts reduce split-vote probability.

### 4. Log replication
- Clients submit commands to the leader.
- Leader appends the command locally, then replicates via `AppendEntries`.
- Followers accept entries only if `prevLogIndex`/`prevLogTerm` consistency checks pass.
- Entry is committed only after majority replication.

This is the safety backbone: committed entries survive leader changes.

### 5. Failure semantics
- **Follower crash**: leader keeps operating; recovered follower catches up.
- **Leader crash**: a new election chooses a replacement from the majority side.
- **Network partition**: only the partition with quorum can commit; minority cannot make progress.
- **Heal**: lagging nodes reconcile to the authoritative log.

## What You Can Actively Test Here

- Submit commands and observe pending vs committed log progression.
- Kill leaders to inspect election recovery paths.
- Partition clusters to validate quorum rules.
- Restart isolated nodes and watch log repair.

The UI is built to expose state transitions, not hide them.

## Engineering Intent

This codebase is intentionally educational:

- It prioritizes protocol clarity and debuggability.
- It emphasizes event-driven observability across backend and UI.
- It keeps the implementation close to Raft's conceptual model so behavior is explainable.

From a personal perspective, this project was where Go became practical for me: goroutines, channels, timer lifecycles, and failure-oriented state transitions moved from syntax-level understanding to systems-level intuition.

## Repository Guide

Root README is conceptual. Implementation and operations are documented in submodules:

- Backend architecture, protocol contracts, and runtime details: [backend/README.md](backend/README.md)
- Frontend architecture, state flow, and UI behavior: [frontend/README.md](frontend/README.md)

## Remote Deployment

This repository includes a production Docker pipeline (`Dockerfile`) and a
Render Blueprint (`render.yaml`).

The container builds frontend + backend, then runs a single Go process that:

- serves the compiled UI from `STATIC_DIR`,
- exposes WebSocket at `/ws`,
- exposes health checks at `/health`,
- reads cloud port from `PORT`,
- starts/stops the Raft cluster based on active WebSocket clients.

Deploy on Render:

1. Push this repository to GitHub.
2. In Render, choose **New + -> Blueprint** and select this repo.
3. Render provisions the `raft-visualizer` web service from `render.yaml`.
4. Open `https://<your-service>.onrender.com`.

## Scope and Non-Goals

This is a simulation platform, not a production consensus library. Some production concerns are intentionally out of scope (for example durable storage, membership reconfiguration, and log compaction), because the primary objective is clear visualization of core Raft behavior.

## References

- [Ongaro, D. & Ousterhout, J. (2014), *In Search of an Understandable Consensus Algorithm (Extended Version)*](https://raft.github.io/raft.pdf)
- [Raft Reference Site](https://raft.github.io/)
- [etcd Raft Implementation](https://github.com/etcd-io/etcd/tree/main/raft)
