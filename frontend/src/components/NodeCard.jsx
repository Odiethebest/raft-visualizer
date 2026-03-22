import { Handle, Position } from '@xyflow/react'
import { useClusterStore } from '../store/clusterStore'
import styles from './NodeCard.module.css'

// NodeCard is the custom xyflow node type for a single Raft participant.
// It receives node data via the `data` prop (injected by ClusterView) and
// reads selectedNodeId from the store to apply the selection ring.
//
// Handles are rendered invisible — they're required by xyflow for edge
// routing but we don't want them to look interactive.
// onClick is intentionally not placed on the inner div here. When both
// nodesDraggable and elementsSelectable are false, xyflow sets
// pointer-events:none on the node wrapper, which silently swallows clicks.
// Selection is handled via onNodeClick on the ReactFlow instance instead.
export default function NodeCard({ data }) {
  const { node } = data
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)

  const isSelected = selectedNodeId === node.id

  function roleClass() {
    if (!node.alive) return styles.dead
    switch (node.role) {
      case 'leader':    return styles.leader
      case 'candidate': return styles.candidate
      default:          return styles.follower
    }
  }

  return (
    <>
      {/* Invisible handles on all four sides so xyflow can route edges from
          any direction — the visual connection points are not shown. */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right}  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />

      <div className={`${styles.node} ${roleClass()} ${isSelected ? styles.selected : ''}`}>
        <span className={styles.nodeId}>{node.id}</span>
        <span className={styles.nodeMeta}>
          {node.alive ? `t${node.term}` : 'dead'}
        </span>
      </div>
    </>
  )
}
