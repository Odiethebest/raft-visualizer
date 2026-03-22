import { useState } from 'react'
import { useClusterStore } from '../store/clusterStore'
import styles from './HintCard.module.css'

// HintCard sits in the top-right of the canvas and explains visual states
// and key interactions. It dismisses automatically when the user selects
// a node (showing they've figured out the primary interaction), or manually
// via the close button. We don't show it again after dismissal — localStorage
// keeps the preference across refreshes.

const DISMISSED_KEY = 'raft-hint-dismissed'

export default function HintCard() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  )
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)

  // Auto-dismiss the first time the user clicks a node — they've discovered
  // the main interaction on their own and don't need the prompt anymore.
  if (!dismissed && selectedNodeId !== null) {
    localStorage.setItem(DISMISSED_KEY, 'true')
    return null
  }

  if (dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>how to read this</span>
        <button className={styles.close} onClick={dismiss} aria-label="dismiss">×</button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchLeader}`} />
          leader — all writes go here
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchFollower}`} />
          follower — replicating passively
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchCandidate}`} />
          candidate — running for election
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchDead}`} />
          dead — simulated crash
        </div>
      </div>

      <div className={styles.tips}>
        <div className={styles.tip}>
          <span className={styles.tipKey}>1.</span>
          Click any node to inspect its log and state in the right panel.
        </div>
        <div className={styles.tip}>
          <span className={styles.tipKey}>2.</span>
          Use the bar at the bottom to submit commands, kill nodes, or partition the network.
        </div>
        <div className={styles.tip}>
          <span className={styles.tipKey}>3.</span>
          Moving dots on the lines are in-flight RPCs — darker means election traffic, lighter means heartbeats.
        </div>
      </div>
    </div>
  )
}
