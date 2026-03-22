import { useClusterStore } from '../store/clusterStore'
import styles from './LogPanel.module.css'

// LogPanel shows per-node stats and log entries for the selected node.
// When nothing is selected it shows a prompt — this avoids rendering a
// "default" node's data that the user didn't ask for, which can be confusing
// when nodes are all followers and look identical.

export default function LogPanel() {
  const nodes          = useClusterStore(s => s.nodes)
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)

  const node = nodes.find(n => n.id === selectedNodeId)

  return (
    <div className={styles.panel}>
      <NodeStats node={node} />
      <LogEntries node={node} />
    </div>
  )
}

function NodeStats({ node }) {
  function roleClass(role, alive) {
    if (!alive) return styles.dead
    return styles[role] ?? ''
  }

  return (
    <>
      <div className={styles.sectionTitle}>node stats</div>
      {node ? (
        <div className={styles.statGrid}>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>role</span>
            <span className={`${styles.statValue} ${roleClass(node.role, node.alive)}`}>
              {node.alive ? node.role : 'dead'}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>term</span>
            <span className={styles.statValue}>{node.term}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>commit</span>
            <span className={styles.statValue}>{node.commitIndex}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>voted for</span>
            <span className={styles.statValue}>
              {node.votedFor === -1 ? '—' : node.votedFor}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          click a node to inspect its state
        </div>
      )}
    </>
  )
}

function LogEntries({ node }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>log entries</div>
      {!node ? (
        <div className={styles.empty}>—</div>
      ) : node.log.length === 0 ? (
        <div className={styles.empty}>no entries</div>
      ) : (
        <div className={styles.logList}>
          {/* Newest entry at top so you can see replication progress
              without scrolling down as the log grows. */}
          {[...node.log].reverse().map(entry => (
            <div key={entry.index} className={styles.logEntry}>
              <div className={`${styles.dot} ${entry.committed ? styles.dotCommitted : styles.dotPending}`} />
              <span className={styles.logIndex}>{entry.index}</span>
              <span className={styles.logTerm}>t{entry.term}</span>
              <span className={styles.logCommand}>{entry.command}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
