import { create } from 'zustand'

const LANG_STORAGE_KEY = 'raft-ui-lang'

let nextEventId = 0
let nextPulseSeq = 1

function nowStamp() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  })
}

function makeLog(from, to, eventType, term, level = 'normal', time = nowStamp()) {
  return {
    id: nextEventId++,
    time,
    from,
    to,
    eventType,
    term,
    level,
  }
}

function rpcSig(m) {
  return `${m.from}|${m.to}|${m.type}|${m.term}`
}

function diffRPCLogs(prevInFlight, nextInFlight) {
  const time = nowStamp()
  const prevCounts = new Map()
  const nextBuckets = new Map()

  for (const m of prevInFlight) {
    const sig = rpcSig(m)
    prevCounts.set(sig, (prevCounts.get(sig) ?? 0) + 1)
  }
  for (const m of nextInFlight) {
    const sig = rpcSig(m)
    if (!nextBuckets.has(sig)) nextBuckets.set(sig, { msg: m, count: 0 })
    nextBuckets.get(sig).count += 1
  }

  const logs = []
  for (const [sig, bucket] of nextBuckets) {
    const prevCount = prevCounts.get(sig) ?? 0
    const delta = bucket.count - prevCount
    if (delta <= 0) continue
    for (let i = 0; i < delta; i++) {
      logs.push(makeLog(bucket.msg.from, bucket.msg.to, bucket.msg.type, bucket.msg.term, 'normal', time))
    }
  }
  return logs
}

function deriveStateLogs(prevNodes, nextNodes) {
  const logs = []
  const time = nowStamp()
  const prevById = new Map(prevNodes.map(n => [n.id, n]))

  for (const next of nextNodes) {
    const prev = prevById.get(next.id)
    if (!prev) continue

    if (prev.role !== next.role) {
      if (next.role === 'leader' && next.alive) {
        logs.push(makeLog(next.id, next.id, 'LeaderElected', next.term, 'active', time))
      } else if (next.role === 'candidate' && next.alive) {
        logs.push(makeLog(next.id, next.id, 'ElectionTimeout', next.term, 'warn', time))
      } else {
        logs.push(makeLog(next.id, next.id, `Role:${next.role}`, next.term, 'normal', time))
      }
    }

    if (next.term > prev.term) {
      logs.push(makeLog(next.id, next.id, 'TermAdvanced', next.term, 'normal', time))
    }

    if (prev.alive && !next.alive) {
      logs.push(makeLog(next.id, next.id, 'NodeCrash', next.term, 'warn', time))
    } else if (!prev.alive && next.alive) {
      logs.push(makeLog(next.id, next.id, 'NodeRestarted', next.term, 'normal', time))
    }

    if (next.commitIndex > prev.commitIndex) {
      logs.push(makeLog(next.id, next.id, 'Committed', next.term, 'active', time))
    }
  }

  return logs
}

function shouldPulse(prevNode, nextNode) {
  if (!prevNode) return false
  return prevNode.role !== nextNode.role || prevNode.term !== nextNode.term
}

export const useClusterStore = create((set, get) => ({
  nodes: [],
  inFlight: [],
  eventLogs: [],
  selectedNodeId: null,
  wsStatus: 'connecting', // 'connecting' | 'connected' | 'reconnecting'
  lang: localStorage.getItem(LANG_STORAGE_KEY) === 'zh' ? 'zh' : 'en',
  eventLogOpen: true,
  actionMode: null, // null | kill | restart | heal | partition-select | partition-confirm
  partitionGroupA: [],
  activePartitionGroups: [],

  // Injected by useRaftWS so any component can fire fault commands without
  // knowing about the WebSocket directly.
  sendFault: null,

  applyStateUpdate(payload) {
    const state = get()
    const rawNodes = Array.isArray(payload?.nodes) ? payload.nodes : []
    const nextInFlight = Array.isArray(payload?.inFlight)
      ? payload.inFlight.slice(-256)
      : []
    const prevNodes = state.nodes
    const prevInFlight = state.inFlight
    const prevById = new Map(prevNodes.map(n => [n.id, n]))

    // We materialize pulse tokens during state ingestion so NodeCard can run
    // short one-shot transitions without guessing transition intent locally.
    const nextNodes = rawNodes.map(n => {
      const prevNode = prevById.get(n.id)
      const pulseSeq = shouldPulse(prevNode, n)
        ? nextPulseSeq++
        : (prevNode?.pulseSeq ?? 0)

      return {
      ...n,
      pulseSeq,
      log: (n.log ?? []).map(entry => ({
        ...entry,
        committed: entry.index <= n.commitIndex,
      })),
      }
    })

    const stateLogs = prevNodes.length > 0
      ? deriveStateLogs(prevNodes, nextNodes)
      : []
    const rpcLogs = diffRPCLogs(prevInFlight, nextInFlight)
    const freshLogs = [...stateLogs, ...rpcLogs]

    set(prev => ({
      nodes: nextNodes,
      inFlight: nextInFlight,
      eventLogs: [...prev.eventLogs, ...freshLogs].slice(-60),
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

  toggleEventLog() {
    set(state => ({ eventLogOpen: !state.eventLogOpen }))
  },

  beginAction(mode) {
    if (mode === 'partition-select') {
      set({ actionMode: mode, partitionGroupA: [] })
      return
    }
    set({ actionMode: mode, partitionGroupA: [] })
  },

  cancelAction() {
    set({ actionMode: null, partitionGroupA: [] })
  },

  togglePartitionGroupANode(id) {
    set(state => {
      if (state.actionMode !== 'partition-select') return {}
      const has = state.partitionGroupA.includes(id)
      const next = has
        ? state.partitionGroupA.filter(x => x !== id)
        : [...state.partitionGroupA, id]
      return { partitionGroupA: next }
    })
  },

  goPartitionConfirm() {
    set(state => (
      state.actionMode === 'partition-select'
        ? { actionMode: 'partition-confirm' }
        : state
    ))
  },

  setActivePartitionGroups(groups) {
    const normalized = Array.isArray(groups) ? groups.filter(Array.isArray) : []
    set({ activePartitionGroups: normalized })
  },

  clearActivePartitionGroups() {
    set({ activePartitionGroups: [] })
  },

  setWsStatus(status) { set({ wsStatus: status }) },
  setSendFault(fn)    { set({ sendFault: fn }) },
}))
