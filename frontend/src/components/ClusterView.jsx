import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  BaseEdge,
  getBezierPath,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useClusterStore } from '../store/clusterStore'
import NodeCard from './NodeCard'
import styles from './ClusterView.module.css'

// --- Layout -----------------------------------------------------------
// Positions are computed once for a fixed cluster size. Nodes sit on a
// circle so the graph looks symmetric regardless of which one is leader.
// We don't use xyflow's auto-layout because Raft's topology never changes —
// every node can talk to every other node — so a static layout is cleaner.

const NODE_RADIUS = 160   // distance from center to each node, in px
const CENTER = { x: 250, y: 220 }
const NODE_SIZE = 72      // must match NodeCard width/height

function computePositions(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI / count) * i
    return {
      x: CENTER.x + NODE_RADIUS * Math.cos(angle) - NODE_SIZE / 2,
      y: CENTER.y + NODE_RADIUS * Math.sin(angle) - NODE_SIZE / 2,
    }
  })
}

// --- Animated edge ----------------------------------------------------
// Each edge between two nodes renders a small circle for every in-flight
// message on that link. The circle slides along the bezier path using SVG
// animateMotion, which avoids any JS animation loop and stays smooth even
// when the React tree is busy re-rendering.

// Message type → dot color. AppendEntries (heartbeat/replication) are the
// dominant message type; RequestVote is highlighted differently so you can
// distinguish election traffic at a glance.
const MSG_COLORS = {
  RequestVote:        '#253745',
  RequestVoteReply:   '#4A5C6A',
  AppendEntries:      '#9BA8AB',
  AppendEntriesReply: '#C2C8C7',
}

function AnimatedEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  // data.messages is the list of in-flight RPCs on this directed link.
  // Each one gets its own animated dot; stagger the delay slightly so
  // bursts of messages (e.g. a leader sending heartbeats to all peers
  // simultaneously) don't all look like a single dot.
  const messages = data?.messages ?? []

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: 'var(--border-main)', strokeWidth: 1.5 }} />
      {messages.map((msg, i) => (
        <circle
          key={`${msg.from}-${msg.to}-${msg.type}-${i}`}
          r={3.5}
          fill={MSG_COLORS[msg.type] ?? '#9BA8AB'}
        >
          <animateMotion
            dur="0.6s"
            begin={`${i * 0.08}s`}
            fill="freeze"
            path={edgePath}
            rotate="auto"
          />
        </circle>
      ))}
    </>
  )
}

const nodeTypes = { raftNode: NodeCard }
const edgeTypes = { animated: AnimatedEdge }

// --- Main component ---------------------------------------------------

export default function ClusterView() {
  const storeNodes  = useClusterStore(s => s.nodes)
  const inFlight    = useClusterStore(s => s.inFlight)

  const positions = useMemo(
    () => computePositions(storeNodes.length || 5),
    [storeNodes.length]
  )

  // Build xyflow node descriptors from store state. Position is stable
  // (same index → same position) so xyflow doesn't recompute the layout.
  const flowNodes = useMemo(() => storeNodes.map((n, i) => ({
    id:       String(n.id),
    type:     'raftNode',
    position: positions[i] ?? { x: 0, y: 0 },
    data:     { node: n },
    draggable: false,
    // Prevent xyflow from selecting nodes on click — we handle selection
    // ourselves in NodeCard so we can store it in Zustand.
    selectable: false,
  })), [storeNodes, positions])

  // Build one directed edge per unique pair, then attach any in-flight
  // messages that match that direction. We use directed edges (A→B and B→A
  // as separate) so animateMotion travels the right way.
  const flowEdges = useMemo(() => {
    const edges = []
    const n = storeNodes.length

    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue
        const messages = inFlight.filter(m => m.from === a && m.to === b)
        edges.push({
          id:     `e${a}-${b}`,
          source: String(a),
          target: String(b),
          type:   'animated',
          data:   { messages },
          // Render edges behind nodes
          zIndex: -1,
        })
      }
    }
    return edges
  }, [storeNodes.length, inFlight])

  const [nodes, , onNodesChange] = useNodesState(flowNodes)
  const [edges, , onEdgesChange] = useEdgesState(flowEdges)

  // Sync external store changes into xyflow's internal state. xyflow owns
  // positions (for future drag support), but we refresh data on every render.
  const syncedNodes = useMemo(() =>
    nodes.map(n => {
      const updated = flowNodes.find(fn => fn.id === n.id)
      return updated ? { ...n, data: updated.data } : n
    }),
    [nodes, flowNodes]
  )

  const onInit = useCallback(rf => {
    rf.fitView({ padding: 0.3 })
  }, [])

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={syncedNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.5}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
