# Project: Raft Consensus Visualizer

A real-time visualization of the Raft distributed consensus algorithm. Go backend simulates a cluster of Raft nodes via goroutines; frontend renders live state over WebSocket.

## Stack

- **Backend:** Go 1.22+, `gorilla/websocket`
- **Frontend:** React 19 + Vite, Zustand, @xyflow/react
- **Communication:** WebSocket (Go → React), JSON event stream

## What You're Building

Each Raft node runs as a goroutine with its own election timer, log, and state machine. Nodes talk to each other through an in-process message bus. The cluster coordinator aggregates state changes and broadcasts them over WebSocket. The frontend mirrors cluster state locally and re-renders on deltas.

Core protocol scope: leader election, log replication, fault injection (kill node, network partition, heal). Persistence, membership changes, and log compaction are out of scope.

## Code Style

### Go

- Standard Go formatting (`gofmt`). No exceptions.
- Exported types and functions get doc comments. Unexported ones only if the behavior isn't obvious from the name.
- Error handling is explicit. No `_` for errors that could actually fail.
- Goroutine ownership is clear: the function that starts a goroutine is responsible for documenting when and how it exits.
- Channel directions in function signatures wherever possible: `chan<-`, `<-chan`.
- Prefer named return values only when they meaningfully document what's being returned.

### React / JavaScript

- Functional components only.
- Custom hooks own their own side effects. No raw `useEffect` in components unless it's genuinely local.
- Zustand store mutations are named after what they do, not what they set: `markNodeDead`, not `setNodeAlive`.
- No inline styles. CSS modules or Tailwind utility classes.

## Comments

Write comments the way a senior engineer would leave notes for someone joining the codebase mid-project. That means:

- Explain **why**, not what. If the code is readable, it already says what it does.
- When something looks wrong but isn't, say so. "This looks like it should be X, but Y because of Z" is a valid and useful comment.
- Call out non-obvious invariants. If a function assumes the caller holds a lock, or that a channel is already closed, say that.
- Don't restate the function signature in prose. `// returns the current leader` above `func getCurrentLeader()` is noise.
- Specific is better than general. "Reset only after draining the channel — see time.Timer docs on the Reset race" is better than "careful with timers."
- If a decision was made for a reason that won't be obvious six months from now, leave a note. Tradeoffs, rejected alternatives, known limitations.

Bad comment:
```go
// increment the term
node.currentTerm++
```

Good comment:
```go
// If we haven't heard from a leader before the timeout fires, we assume
// it's gone and start a new election. The term increment is what makes
// old leaders and stale votes from the previous term get rejected.
node.currentTerm++
```

## Commit Messages

Do not include any attribution to Claude in commit messages or co-author fields. Commits should look like they came from the developer.

Format: `type: short description` — conventional commits style.

```
feat: implement randomized election timeout per node
fix: drain timer channel before Reset to avoid race
refactor: extract vote counting logic into countVotes helper
```

No period at the end. Imperative mood. Under 72 characters for the subject line.

## File Organization

```
backend/
  raft/         core protocol logic only — no I/O, no WebSocket
  simulator/    cluster wiring, message routing, fault injection
  ws/           WebSocket server, client hub, message types

frontend/src/
  hooks/        data fetching, WebSocket, derived state
  store/        Zustand slices
  components/   presentational only — no direct store writes
```

Keep `raft/` pure. It should be testable without standing up a WebSocket server.

## Things to Watch

- `time.Timer.Reset()` has a documented race if the channel has already fired. Always drain before resetting.
- The in-process message bus drops messages to dead nodes silently. Callers should not assume delivery.
- Zustand store updates from WebSocket arrive on a background goroutine's schedule, not React's render cycle. Batch if needed.