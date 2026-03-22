import { Handle, Position } from '@xyflow/react'
import { useClusterStore } from '../store/clusterStore'
import styles from './NodeCard.module.css'

// NodeCard reads live node state directly from the Zustand store rather than
// from the xyflow `data` prop. This means the component re-renders on store
// changes independently of xyflow's reconciliation cycle — so heartbeat
// updates don't cause xyflow to remount the node (which would flicker and
// break click detection).
//
// The `data` prop only carries the node id, which never changes for the
// lifetime of the cluster.
export default function NodeCard({ data }) {
  const nodeId = data.nodeId

  const node           = useClusterStore(s => s.nodes.find(n => n.id === nodeId))
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)

  // Node data may briefly be undefined during the first render before
  // the WebSocket delivers the initial snapshot.
  if (!node) return null

  const isSelected = selectedNodeId === nodeId

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
