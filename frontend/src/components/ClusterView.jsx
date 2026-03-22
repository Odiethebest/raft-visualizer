import { useMemo } from 'react'
import {
  ReactFlow,
  BaseEdge,
  getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useClusterStore } from '../store/clusterStore'
import NodeCard from './NodeCard'
import HintCard from './HintCard'
import styles from './ClusterView.module.css'

// --- Layout -----------------------------------------------------------
// Positions are computed once for a fixed cluster size. Nodes sit on a
// circle so the graph looks symmetric regardless of which one is leader.
// We don't use xyflow's auto-layout because Raft's topology never changes —
// every node can talk to every other node — so a static layout is cleaner.

const NODE_RADIUS = 160
const CENTER = { x: 250, y: 220 }
const NODE_SIZE = 72  // must match NodeCard width/height in CSS

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
// Each edge renders a sliding dot for every in-flight RPC on that link.
// SVG animateMotion is used rather than a JS animation loop — it runs on
// the compositor thread and doesn't block React renders.

const MSG_COLORS = {
  RequestVote:        '#253745',
  RequestVoteReply:   '#4A5C6A',
  AppendEntries:      '#9BA8AB',
  AppendEntriesReply: '#C2C8C7',
}

function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
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
          {/* Stagger start time slightly when multiple messages are in flight
              on the same link so they don't appear as a single merged dot. */}
          <animateMotion dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" path={edgePath} rotate="auto" />
        </circle>
      ))}
    </>
  )
}

// nodeTypes and edgeTypes must be defined outside the component. If they're
// defined inline, React creates new object references on every render, which
// causes xyflow to remount every node and edge — visible as flickering.
const nodeTypes = { raftNode: NodeCard }
const edgeTypes = { animated: AnimatedEdge }

// --- Main component ---------------------------------------------------

export default function ClusterView() {
  const storeNodes = useClusterStore(s => s.nodes)
  const inFlight   = useClusterStore(s => s.inFlight)

  const positions = useMemo(
    () => computePositions(storeNodes.length || 5),
    [storeNodes.length]
  )

  // flowNodes is recomputed on every store update so xyflow always reflects
  // the latest state. We don't use useNodesState here because that hook
  // initialises once and never syncs external changes — it's designed for
  // user-driven drag interactions, not externally-driven state machines.
  const flowNodes = useMemo(() =>
    storeNodes.map((n, i) => ({
      id:        String(n.id),
      type:      'raftNode',
      position:  positions[i] ?? { x: 0, y: 0 },
      data:      { node: n },
      draggable: false,
      selectable: false,
    })),
    [storeNodes, positions]
  )

  // One directed edge per ordered pair so animateMotion dots travel the
  // right direction. All 20 edges (5×4) are always present; in-flight
  // messages are attached as data so the edge component can render dots.
  const flowEdges = useMemo(() => {
    const n = storeNodes.length
    const edges = []
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue
        edges.push({
          id:     `e${a}-${b}`,
          source: String(a),
          target: String(b),
          type:   'animated',
          data:   { messages: inFlight.filter(m => m.from === a && m.to === b) },
          zIndex: -1,
        })
      }
    }
    return edges
  }, [storeNodes.length, inFlight])

  return (
    <div className={styles.canvas}>
      <HintCard />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
