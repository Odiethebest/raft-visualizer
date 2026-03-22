import { Handle, Position } from '@xyflow/react'
import { useClusterStore } from '../store/clusterStore'
import { deadBadgeLabel } from '../i18n/uiText'
import styles from './NodeCard.module.css'

// NodeCard reads node state from the `data` prop injected by ClusterView.
// It subscribes to selectedNodeId directly from the store — that's the only
// store access here, because selection changes are infrequent and don't
// trigger the same high-frequency re-render storm that live node data would.
export default function NodeCard({ data }) {
  const { node } = data
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)
  const lang = useClusterStore(s => s.lang)

  if (!node) return null

  const isSelected = selectedNodeId === node.id

  function roleClass() {
    if (!node.alive) return styles.dead
    switch (node.role) {
      case 'leader':    return styles.leader
      case 'candidate': return styles.candidate
      default:          return styles.follower
    }
  }

  const hiddenHandleStyle = { opacity: 0, pointerEvents: 'none' }

  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Right} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Top} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Bottom} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Left} style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />

      <div className={`${styles.node} ${roleClass()} ${isSelected ? styles.selected : ''}`}>
        <span className={styles.nodeId}>{node.id}</span>
        <span className={styles.nodeMeta}>
          {node.alive ? `t${node.term}` : deadBadgeLabel(lang)}
        </span>
      </div>
    </>
  )
}
