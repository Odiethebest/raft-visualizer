import { useMemo, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
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
const FOLLOWER_SIZE = 72
const LEADER_SIZE = 86.4

function computeCenters(count) {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI / count) * i
    return {
      x: CENTER.x + NODE_RADIUS * Math.cos(angle),
      y: CENTER.y + NODE_RADIUS * Math.sin(angle),
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

const MSG_DURATION = {
  AppendEntries: '2.1s',
}

// AnimatedEdge reads inFlight directly from the store so that it can
// update independently of xyflow's reconciliation. If we passed messages
// through the edge `data` prop instead, xyflow would re-create the entire
// edge (and restart animateMotion from zero) every time a new heartbeat
// arrived — producing the one-frame flicker seen before this fix.
function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target }) {
  const [hovered, setHovered] = useState(false)
  const from = Number(source)
  const to = Number(target)
  const inFlight = useClusterStore(s => s.inFlight)
  const messages = useMemo(
    () => inFlight
      .filter(m => m.from === from && m.to === to && m.type === 'AppendEntries')
      .slice(-1),
    [inFlight, from, to]
  )

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const stroke = hovered ? '#9BA8AB' : '#C2C8C7'
  const markerId = `arrow-${id}`

  return (
    <>
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="8.2" refY="3.5" orient="auto">
          <path d="M0,0 L10,3.5 L0,7 z" fill={stroke} />
        </marker>
      </defs>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        markerEnd={`url(#${markerId})`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {messages.map((msg, i) => (
        <circle key={`${from}-${to}-${msg.type}-${i}`} r={3.5} fill={MSG_COLORS[msg.type] ?? '#9BA8AB'}>
          <animateMotion
            dur={MSG_DURATION[msg.type] ?? '1.8s'}
            begin={`${i * 0.24}s`}
            fill="freeze"
            path={edgePath}
            rotate="auto"
          />
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
  const nodes = useClusterStore(s => s.nodes)
  const selectNode = useClusterStore(s => s.selectNode)
  const actionMode = useClusterStore(s => s.actionMode)
  const activePartitionGroups = useClusterStore(s => s.activePartitionGroups)
  const togglePartitionGroupANode = useClusterStore(s => s.togglePartitionGroupANode)
  const cancelAction = useClusterStore(s => s.cancelAction)
  const sendFault = useClusterStore(s => s.sendFault)
  const clearActivePartitionGroups = useClusterStore(s => s.clearActivePartitionGroups)

  const nodeCount = nodes.length
  const centers = useMemo(() => computeCenters(nodeCount), [nodeCount])
  const leader = nodes.find(n => n.alive && n.role === 'leader')

  const partitionedSet = useMemo(() => {
    const set = new Set()
    for (const group of activePartitionGroups) {
      for (const id of group) set.add(id)
    }
    return set
  }, [activePartitionGroups])

  // flowNodes is derived directly from the store's nodes array — no
  // placeholder nodes. An empty array before data arrives means ReactFlow
  // starts with a clean canvas, and NodeCard never receives a null node.
  // When data arrives, all nodes appear at once with real state.
  const flowNodes = useMemo(() =>
    nodes.map((node, i) => {
      const size = node.role === 'leader' && node.alive ? LEADER_SIZE : FOLLOWER_SIZE
      const center = centers[i] ?? { x: 0, y: 0 }

      return {
        id:        String(node.id),
        type:      'raftNode',
        position:  { x: center.x - size / 2, y: center.y - size / 2 },
        data:      { node },
        draggable: false,
      }
    }),
    [nodes, centers]
  )

  const flowEdges = useMemo(() => {
    if (!leader) return []
    return nodes
      .filter(n => n.id !== leader.id && n.alive)
      .map(n => ({
        id:     `e${leader.id}-${n.id}`,
        source: String(leader.id),
        target: String(n.id),
        type:   'animated',
        zIndex: -1,
      }))
  }, [leader, nodes])

  function handleActionClick(node) {
    if (actionMode === 'partition-select') {
      if (node.alive) togglePartitionGroupANode(node.id)
      return true
    }

    if (actionMode === 'kill') {
      if (!node.alive) return true
      sendFault?.('kill', [node.id], [], '')
      cancelAction()
      return true
    }

    if (actionMode === 'restart') {
      if (node.alive) return true
      sendFault?.('restart', [node.id], [], '')
      cancelAction()
      return true
    }

    if (actionMode === 'heal') {
      const selectable = !node.alive || partitionedSet.has(node.id)
      if (!selectable) return true

      if (!node.alive) {
        sendFault?.('restart', [node.id], [], '')
      } else {
        sendFault?.('heal', [], [], '')
        clearActivePartitionGroups()
      }
      cancelAction()
      return true
    }

    if (actionMode === 'partition-confirm') {
      return true
    }
    return false
  }

  return (
    <div className={styles.canvas}>
      <HintCard />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, flowNode) => {
          const node = nodes.find(n => Number(n.id) === Number(flowNode.id))
          if (!node) return
          if (handleActionClick(node)) return
          selectNode(Number(flowNode.id))
        }}
        onPaneClick={() => {
          if (actionMode) return
          selectNode(null)
        }}
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
