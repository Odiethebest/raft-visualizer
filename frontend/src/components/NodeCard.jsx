import { Handle, Position } from '@xyflow/react'
import { useClusterStore } from '../store/clusterStore'
import { deadBadgeLabel } from '../i18n/uiText'
import styles from './NodeCard.module.css'

// NodeCard reads node state from the `data` prop injected by ClusterView.
// It subscribes to selectedNodeId directly from the store — that's the only
// store access here, because selection changes are infrequent and don't
// trigger the same high-frequency re-render storm that live node data would.
export default function NodeCard({ data }) {
  const node = data?.node ?? null
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)
  const lang = useClusterStore(s => s.lang)
  const actionMode = useClusterStore(s => s.actionMode)
  const partitionGroupA = useClusterStore(s => s.partitionGroupA)
  const activePartitionGroups = useClusterStore(s => s.activePartitionGroups)

  const isSelected = node ? selectedNodeId === node.id : false
  const inPartitionA = node ? partitionGroupA.includes(node.id) : false
  const inKnownPartition = node
    ? activePartitionGroups.some(group => group.includes(node.id))
    : false

  const selectable = node ? (() => {
    if (actionMode === 'kill') return node.alive
    if (actionMode === 'restart') return !node.alive
    if (actionMode === 'heal') return !node.alive || inKnownPartition
    if (actionMode === 'partition-select') return node.alive
    return false
  })() : false

  if (!node) return null

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

      <div key={`node-${node.id}-${node.pulseSeq ?? 0}`} className={[
        styles.node,
        roleClass(),
        isSelected ? styles.selected : '',
        node.pulseSeq ? styles.pulseOnce : '',
        actionMode === 'partition-select' && selectable ? styles.partitionSelectable : '',
        actionMode === 'partition-select' && inPartitionA ? styles.partitionSelected : '',
        actionMode !== 'partition-select' && selectable ? styles.actionSelectable : '',
      ].filter(Boolean).join(' ')}>
        <span className={styles.nodeId}>{node.id}</span>
        <span className={styles.nodeMeta}>
          {node.alive ? `t${node.term}` : deadBadgeLabel(lang)}
        </span>
      </div>
    </>
  )
}
