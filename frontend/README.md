# Raft Visualizer Frontend

This folder contains the React + Vite UI for the Raft simulator backend.
It renders:

- the live cluster graph (nodes + animated RPC traffic),
- a right-side inspection panel (node stats + log entries + event stream),
- a bottom control bar (fault injection + command submission),
- a built-in guide card with Chinese/English display support.

## Requirements

- Node.js 20+ (recommended: latest LTS)
- Backend server running on `http://localhost:8080` (default)

## Quick Start

From this `frontend/` directory:

```bash
npm install
npm run dev
```

Open: `http://127.0.0.1:5173` (or the URL printed by Vite).

## Build & Preview

```bash
npm run build
npm run preview
```

## How Frontend Talks to Backend

The app uses a WebSocket connection to `/ws`.

- In development, Vite proxies `/ws` to `http://localhost:8080` (see `vite.config.js`).
- In production/default behavior, the app connects to the current page host (`ws://<host>/ws` or `wss://<host>/ws`).
- You can override the endpoint with `VITE_WS_URL`.

Incoming message shape (from backend):

```json
{
  "type": "STATE_UPDATE",
  "payload": {
    "nodes": [...],
    "inFlight": [...]
  }
}
```

Outgoing fault injection shape (from frontend):

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

## Architecture Overview

### 1) WebSocket lifecycle
- File: `src/hooks/useRaftWS.js`
- Responsibilities:
  - connect/reconnect,
  - parse WS messages,
  - push snapshots into the store,
  - expose `sendFault(...)` to the UI.

### 2) Global state
- File: `src/store/clusterStore.js`
- Built with Zustand.
- Stores:
  - cluster snapshot (`nodes`, `inFlight`),
  - UI state (`selectedNodeId`, `wsStatus`, `lang`),
  - derived timeline events (`events`).

### 3) Rendering
- `src/components/ClusterView.jsx`: graph canvas (React Flow), node layout, animated edges.
- `src/components/NodeCard.jsx`: each node appearance by role/aliveness.
- `src/components/LogPanel.jsx`: selected node stats + log entries.
- `src/components/EventStream.jsx`: derived event timeline.
- `src/components/ControlPanel.jsx`: submit command / kill / restart / partition / heal.
- `src/components/HintCard.jsx`: on-screen guide with reopen event support.

### 4) Text / language system
- File: `src/i18n/uiText.js`
- Provides centralized labels/formatters for:
  - app header text,
  - status labels,
  - control panel labels,
  - node/log/event copy,
  - event message formatting.

## UI Language Toggle

The header includes a language toggle button next to the Guide button.

- `zh` mode: intentionally mixed Chinese + English technical terms.
- `en` mode: pure professional English labels/messages.
- Language preference is persisted in `localStorage` (`raft-ui-lang`).

## Guide Card Behavior

- The guide card can auto-dismiss after meaningful interaction.
- It can always be reopened from the header Guide button.
- Dismiss state is persisted in `localStorage` (`raft-hint-dismissed`).

## Performance Notes

- In-flight message rendering is intentionally bounded to avoid overdraw.
- Edge animation duration is tuned by message type (vote vs append/heartbeat).
- Snapshot ingestion trims very large in-flight arrays defensively.

## Project Structure (Frontend Only)

```text
frontend/
  src/
    App.jsx
    hooks/useRaftWS.js
    store/clusterStore.js
    i18n/uiText.js
    components/
      ClusterView.jsx
      NodeCard.jsx
      LogPanel.jsx
      EventStream.jsx
      ControlPanel.jsx
      HintCard.jsx
```

## Useful Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run preview` - preview built output
- `npm run lint` - lint source files

## Troubleshooting

1. **No data on screen**
   - Ensure backend is running on `:8080`.
   - Check browser network tab for `/ws` upgrade success.

2. **WS keeps reconnecting**
   - Verify backend process is stable and not restarted repeatedly.
   - Confirm reverse proxy / local firewall is not closing WebSocket connections.

3. **Guide card does not appear**
   - Use the Guide button in header to reopen it.

4. **Language does not switch**
   - Confirm `lang` is updating in Zustand (`raft-ui-lang` in `localStorage`).
