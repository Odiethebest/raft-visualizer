import { create } from 'zustand'

const LANG_STORAGE_KEY = 'raft-ui-lang'

// Monotonic counter for event IDs. Using an index as a React key breaks when
// events are prepended (all indices shift, so React reconciles against the
// wrong elements). A stable ID avoids that.
let nextEventId = 0

// deriveEvents compares two node snapshots and emits human-readable event
// strings for any meaningful transitions. We intentionally skip minor churn
// (e.g. repeated heartbeat acks) and only surface role changes, term bumps,
// and aliveness changes — the things a reader actually wants to track.
function deriveEvents(prevNodes, nextNodes) {
  const events = []
  const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  for (const next of nextNodes) {
    const prev = prevNodes.find(n => n.id === next.id)
    if (!prev) continue

    if (prev.role !== next.role) {
      const level = next.role === 'leader' ? 'active' : 'normal'
      events.push({
        id: nextEventId++,
        time: now,
        kind: 'role_changed',
        nodeId: next.id,
        role: next.role,
        term: next.term,
        level,
      })
    } else if (prev.term !== next.term) {
      events.push({
        id: nextEventId++,
        time: now,
        kind: 'term_changed',
        nodeId: next.id,
        term: next.term,
        level: 'normal',
      })
    }

    if (prev.alive && !next.alive) {
      events.push({
        id: nextEventId++,
        time: now,
        kind: 'node_killed',
        nodeId: next.id,
        level: 'warn',
      })
    } else if (!prev.alive && next.alive) {
      events.push({
        id: nextEventId++,
        time: now,
        kind: 'node_restarted',
        nodeId: next.id,
        level: 'normal',
      })
    }

    if (next.commitIndex > prev.commitIndex) {
      events.push({
        id: nextEventId++,
        time: now,
        kind: 'commit_advanced',
        nodeId: next.id,
        commitIndex: next.commitIndex,
        level: 'normal',
      })
    }
  }

  return events
}

export const useClusterStore = create((set, get) => ({
  nodes: [],
  inFlight: [],
  // Events are prepended so the newest appears at the top; capped at 200 to
  // prevent unbounded growth during a long session.
  events: [],
  selectedNodeId: null,
  wsStatus: 'connecting', // 'connecting' | 'connected' | 'reconnecting'
  lang: localStorage.getItem(LANG_STORAGE_KEY) === 'zh' ? 'zh' : 'en',

  // Injected by useRaftWS so any component can fire fault commands without
  // knowing about the WebSocket directly.
  sendFault: null,

  applyStateUpdate(payload) {
    const raw = Array.isArray(payload?.nodes) ? payload.nodes : []
    const inFlight = Array.isArray(payload?.inFlight)
      ? payload.inFlight.slice(-256)
      : []
    const prev = get().nodes

    // Annotate each log entry with its committed status. The backend sends
    // commitIndex as a scalar; we convert it here so components can treat
    // each entry as self-describing.
    const nodes = raw.map(n => ({
      ...n,
      log: (n.log ?? []).map(entry => ({
        ...entry,
        committed: entry.index <= n.commitIndex,
      })),
    }))

    const newEvents = prev.length > 0 ? deriveEvents(prev, nodes) : []

    set(state => ({
      nodes,
      inFlight,
      events: [...newEvents, ...state.events].slice(0, 200),
    }))
  },

  selectNode(id) {
    set({ selectedNodeId: id })
  },

  setLang(lang) {
    const nextLang = lang === 'en' ? 'en' : 'zh'
    localStorage.setItem(LANG_STORAGE_KEY, nextLang)
    set({ lang: nextLang })
  },

  toggleLang() {
    const nextLang = get().lang === 'en' ? 'zh' : 'en'
    localStorage.setItem(LANG_STORAGE_KEY, nextLang)
    set({ lang: nextLang })
  },

  setWsStatus(status) { set({ wsStatus: status }) },
  setSendFault(fn)    { set({ sendFault: fn }) },
}))
