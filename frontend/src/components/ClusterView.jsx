import { useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  BaseEdge,
  getBezierPath,
  useReactFlow,
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
  const from = Number(source)
  const to = Number(target)
  const inFlight = useClusterStore(s => s.inFlight)
  const messages = useMemo(
    () => inFlight.filter(m => m.from === from && m.to === to),
    [inFlight, from, to]
  )

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

// Calls fitView once when nodes first become available, after a brief delay
// so ReactFlow has time to measure node dimensions via ResizeObserver.
// Must be a direct child of <ReactFlow> to access the ReactFlow context.
function FitViewOnLoad({ nodeCount }) {
  const { fitView } = useReactFlow()
  const fitted = useRef(false)

  useEffect(() => {
    if (nodeCount > 0 && !fitted.current) {
      fitted.current = true
      const id = setTimeout(() => fitView({ padding: 0.25 }), 50)
      return () => clearTimeout(id)
    }
  }, [nodeCount, fitView])

  return null
}

// --- Main component ---------------------------------------------------

export default function ClusterView() {
  const nodes      = useClusterStore(s => s.nodes)
  const selectNode = useClusterStore(s => s.selectNode)

  const nodeCount = nodes.length
  const positions = useMemo(() => computePositions(nodeCount), [nodeCount])

  // flowNodes is derived directly from the store's nodes array — no
  // placeholder nodes. An empty array before data arrives means ReactFlow
  // starts with a clean canvas, and NodeCard never receives a null node.
  // When data arrives, all nodes appear at once with real state.
  const flowNodes = useMemo(() =>
    nodes.map((node, i) => ({
      id:        String(i),
      type:      'raftNode',
      position:  positions[i] ?? { x: 0, y: 0 },
      data:      { node },
      draggable: false,
    })),
    [nodes, positions]
  )

  // Edges are static in shape — AnimatedEdge subscribes to the store for
  // the in-flight message dots so the edge component itself never remounts.
  const flowEdges = useMemo(() => {
    if (nodeCount === 0) return []
    const edges = []
    for (let a = 0; a < nodeCount; a++) {
      for (let b = 0; b < nodeCount; b++) {
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
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <FitViewOnLoad nodeCount={nodeCount} />
      </ReactFlow>
    </div>
  )
}
