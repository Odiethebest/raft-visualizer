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

const NODE_RADIUS = 160
const CENTER      = { x: 250, y: 220 }
const NODE_SIZE   = 72

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

const MSG_COLORS = {
  RequestVote:        '#253745',
  RequestVoteReply:   '#4A5C6A',
  AppendEntries:      '#9BA8AB',
  AppendEntriesReply: '#C2C8C7',
}

// AnimatedEdge reads inFlight directly from the store so that it can
// update independently of xyflow's reconciliation. If we passed messages
// through the edge `data` prop instead, xyflow would re-create the entire
// edge (and restart animateMotion from zero) every time a new heartbeat
// arrived — producing the one-frame flicker seen before this fix.
function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target }) {
  const from     = Number(source)
  const to       = Number(target)
  const messages = useClusterStore(s => s.inFlight.filter(m => m.from === from && m.to === to))

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: 'var(--border-main)', strokeWidth: 1.5 }} />
      {messages.map((msg, i) => (
        <circle key={`${from}-${to}-${msg.type}-${i}`} r={3.5} fill={MSG_COLORS[msg.type] ?? '#9BA8AB'}>
          <animateMotion dur="0.6s" begin={`${i * 0.08}s`} fill="freeze" path={edgePath} rotate="auto" />
        </circle>
      ))}
    </>
  )
}

// Defined outside the component so React never sees a new reference and
// xyflow never remounts node/edge types mid-session.
const nodeTypes = { raftNode: NodeCard }
const edgeTypes = { animated: AnimatedEdge }

// --- Main component ---------------------------------------------------

export default function ClusterView() {
  const nodeCount  = useClusterStore(s => s.nodes.length)
  const selectNode = useClusterStore(s => s.selectNode)

  const positions = useMemo(() => computePositions(nodeCount || 5), [nodeCount])

  // flowNodes carries only position and id — never live state like role or
  // term. Those are read directly from the store by NodeCard. This keeps the
  // xyflow node tree stable across the ~50ms heartbeat updates that would
  // otherwise cause constant remounting and break click detection.
  const flowNodes = useMemo(() =>
    Array.from({ length: nodeCount || 5 }, (_, i) => ({
      id:        String(i),
      type:      'raftNode',
      position:  positions[i] ?? { x: 0, y: 0 },
      data:      { nodeId: i },
      draggable: false,
    })),
    [nodeCount, positions]
  )

  // Edges are also static — AnimatedEdge subscribes to the store for dots.
  const flowEdges = useMemo(() => {
    const n = nodeCount || 5
    const edges = []
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue
        edges.push({
          id:     `e${a}-${b}`,
          source: String(a),
          target: String(b),
          type:   'animated',
          zIndex: -1,
        })
      }
    }
    return edges
  }, [nodeCount])

  return (
    <div className={styles.canvas}>
      <HintCard />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, flowNode) => selectNode(Number(flowNode.id))}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}
