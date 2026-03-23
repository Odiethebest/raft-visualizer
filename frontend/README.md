# Frontend: Raft Consensus Visualizer

This directory contains the React + Vite client for the Raft simulator backend.
It has two runtime surfaces:

- Intro landing: narrative Raft walkthrough (desktop sidebar navigation, mobile full-screen chapter flow).
- Live demo: real-time cluster visualization with fault injection and log inspection.

## Stack

- React 19
- Zustand (global state)
- React Flow (`@xyflow/react`) for graph rendering
- Vite 8

## Quick Start

Run from `frontend/`:

```bash
npm install
npm run dev
```

Default dev URL: `http://127.0.0.1:5173`

Production build:

```bash
npm run build
npm run preview
```

## Runtime Flow

`App.jsx` is the root switch:

1. Render `IntroLanding` first.
2. After `Start Demo`, mount `LiveDemoApp`.
3. `LiveDemoApp` mounts `useRaftWS()`, so WebSocket traffic starts only while demo is open.

Desktop demo layout:

- Top header
- Left canvas (`ClusterView` + `ControlPanel`)
- Right panel (`LogPanel` + optional `EventStream`)

Mobile demo layout (`max-width: 768px`):

- Compact header
- React Flow canvas with dynamic height (`--canvas-height`)
- Floating action menu (`MobileFab`)
- Bottom drawer (`MobileDrawer`) with tabs (`NODE`, `EVENT LOG`, `TUTORIAL`)

## WebSocket Contract

Connection target:

- Dev: `/ws` is proxied to `http://localhost:8080` in `vite.config.js`
- Prod default: `ws(s)://<current-host>/ws`
- Override: `VITE_WS_URL`

Incoming:

```json
{
  "type": "STATE_UPDATE",
  "payload": {
    "nodes": [],
    "inFlight": []
  }
}
```

Outgoing:

```json
{
  "type": "FAULT_INJECT",
  "payload": {
    "action": "kill | restart | partition | heal | submit",
    "targets": [],
    "partitionGroups": [],
    "command": ""
  }
}
```

```json
{
  "type": "CLIENT_COMMAND",
  "payload": { "command": "set x=1" }
}
```

`CLIENT_COMMAND` is used by the mobile drawer command input; desktop submit uses `FAULT_INJECT` with `action: "submit"`.

## State Model (`src/store/clusterStore.js`)

Primary state:

- Cluster snapshot: `nodes`, `inFlight`
- UI state: `selectedNodeId`, `wsStatus`, `lang`, `eventLogOpen`
- Fault workflow state: `actionMode`, `partitionGroupA`, `activePartitionGroups`
- Derived stream: `eventLogs` (capped to latest 60)

Key behaviors:

- `applyStateUpdate` normalizes logs and marks committed entries (`entry.index <= commitIndex`).
- Store derives high-level event logs from role/term/alive/commit changes plus RPC deltas.
- One-shot node pulse tokens (`pulseSeq`) are generated in store to drive deterministic role/term transition animation.

## Component Responsibilities

- `src/components/IntroLanding.jsx`: chapter-based introduction, language toggle, desktop section nav, mobile full-screen storytelling.
- `src/components/ClusterView.jsx`: node positioning, leader→follower directed edges, heartbeat animations, click routing for selection and fault target picking.
- `src/components/NodeCard.jsx`: visual encoding for `leader/follower/candidate/dead`, selection, and fault-target highlights.
- `src/components/ControlPanel.jsx`: desktop command + fault controls and desktop tutorial panel.
- `src/components/LogPanel.jsx`: selected node stats and replicated log entries.
- `src/components/EventStream.jsx`: timestamped event/RPC timeline.
- `src/components/MobileDrawer.jsx`: mobile collapsed/half/full drawer with tabs and touch drag.
- `src/components/MobileFab.jsx`: mobile fault action entry and partition two-step confirm flow.
- `src/components/HintCard.jsx`: desktop in-canvas quick guide with dismiss persistence.

## i18n & Persistence

All UI copy is centralized in `src/i18n/uiText.js`.

- Default language: English
- Chinese mode: mixed Chinese/English technical terms
- English mode: pure English wording
- LocalStorage keys:
  - `raft-ui-lang`: language preference
  - `raft-hint-dismissed`: hint card dismissal

## Scripts

- `npm run dev` start local dev server
- `npm run build` build production assets
- `npm run preview` preview production build
- `npm run lint` run ESLint

## Frontend Tree

```text
frontend/
  src/
    App.jsx
    App.css
    index.css
    main.jsx
    hooks/useRaftWS.js
    store/clusterStore.js
    i18n/uiText.js
    components/
      ClusterView.jsx
      ControlPanel.jsx
      EventStream.jsx
      HintCard.jsx
      IntroLanding.jsx
      LogPanel.jsx
      MobileDrawer.jsx
      MobileFab.jsx
      NodeCard.jsx
```

## Troubleshooting

1. No nodes rendered
   - Ensure backend WS endpoint is reachable.
   - Check browser DevTools for successful `/ws` upgrade and `STATE_UPDATE` frames.

2. Continuous reconnecting
   - Backend likely unavailable or reverse proxy is closing WS.
   - Verify `VITE_WS_URL` / host routing.

3. Fault actions do nothing
   - Confirm WebSocket status is `Connected`.
   - In node-target modes, you must tap/click a highlighted valid node.

4. Language or guide state seems stale
   - Clear `raft-ui-lang` / `raft-hint-dismissed` in localStorage.
