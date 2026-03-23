import { useState } from 'react'
import { useClusterStore } from '../store/clusterStore'
import { deadLabel, logCopy, roleLabel } from '../i18n/uiText'
import styles from './LogPanel.module.css'

// LogPanel shows per-node stats and log entries for the selected node.
// When nothing is selected it shows a prompt — this avoids rendering a
// "default" node's data that the user didn't ask for, which can be confusing
// when nodes are all followers and look identical.

export default function LogPanel({ commandInput = null, className = '' }) {
  const nodes          = useClusterStore(s => s.nodes)
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)
  const lang           = useClusterStore(s => s.lang)

  // Coerce both sides to number — the store id comes from JSON (number),
  // and selectedNodeId is set via Number(flowNode.id), but an extra guard
  // here prevents a silent mismatch if either side is ever a string.
  const node = nodes.find(n => Number(n.id) === Number(selectedNodeId))
  const rootClass = [styles.panel, className].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      <NodeStats node={node} lang={lang} />
      <LogEntries node={node} lang={lang} commandInput={commandInput} />
    </div>
  )
}

function formatVotedFor(node) {
  if (node.votedFor === null || node.votedFor === undefined || node.votedFor === -1) {
    return '—'
  }
  if (Number(node.votedFor) === Number(node.id)) {
    return 'self'
  }
  return `node ${node.votedFor} · t${node.term}`
}

function NodeStats({ node, lang }) {
  const text = logCopy(lang)

  function roleClass(role, alive) {
    if (!alive) return styles.dead
    return styles[role] ?? ''
  }

  return (
    <>
      <div className={styles.sectionTitle}>{text.nodeStats}</div>
      {node ? (
        <div className={styles.statGrid}>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>{text.role}</span>
            <span className={`${styles.statValue} ${roleClass(node.role, node.alive)}`}>
              {node.alive ? roleLabel(node.role, lang) : deadLabel(lang)}
            </span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>{text.term}</span>
            <span className={styles.statValue}>{node.term}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>{text.commit}</span>
            <span className={styles.statValue}>{node.commitIndex}</span>
          </div>
          <div className={styles.statCell}>
            <span className={styles.statLabel}>{text.votedFor}</span>
            <span className={styles.statValue}>
              {formatVotedFor(node)}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.placeholder}>
          {text.clickNode}
        </div>
      )}
    </>
  )
}

function LogEntries({ node, lang, commandInput }) {
  const text = logCopy(lang)
  const [cmdText, setCmdText] = useState('')
  const hasCommandInput = Boolean(commandInput?.onSubmit)

  function submitCommand(e) {
    e.preventDefault()
    if (!hasCommandInput) return
    const command = cmdText.trim()
    if (!command) return
    commandInput.onSubmit(command)
    setCmdText('')
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{text.logEntries}</div>
      {hasCommandInput && (
        <form className={styles.commandBar} onSubmit={submitCommand}>
          <input
            className={styles.commandInput}
            value={cmdText}
            onChange={(e) => setCmdText(e.target.value)}
            placeholder={commandInput.placeholder ?? 'type a command...'}
          />
          <button
            className={styles.commandSend}
            type="submit"
            disabled={!cmdText.trim()}
          >
            {commandInput.sendLabel ?? 'send'}
          </button>
        </form>
      )}
      {!node ? (
        <div className={styles.empty}>—</div>
      ) : node.log.length === 0 ? (
        <div className={`${styles.empty} ${styles.emptyLog}`}>{text.noEntries}</div>
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
