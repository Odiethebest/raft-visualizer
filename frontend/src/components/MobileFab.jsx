import { useEffect, useMemo, useState } from 'react'
import { useClusterStore } from '../store/clusterStore'
import styles from './MobileFab.module.css'

const ACTIONS = [
  { key: 'kill', label: 'Kill Node', mode: 'kill', danger: true },
  { key: 'restart', label: 'Restart', mode: 'restart' },
  { key: 'partition', label: 'Partition', mode: 'partition-select' },
  { key: 'heal', label: 'Heal', mode: 'heal' },
]

export default function MobileFab() {
  const [open, setOpen] = useState(false)
  const nodes = useClusterStore(s => s.nodes)
  const actionMode = useClusterStore(s => s.actionMode)
  const partitionGroupA = useClusterStore(s => s.partitionGroupA)
  const beginAction = useClusterStore(s => s.beginAction)
  const cancelAction = useClusterStore(s => s.cancelAction)
  const goPartitionConfirm = useClusterStore(s => s.goPartitionConfirm)
  const setActivePartitionGroups = useClusterStore(s => s.setActivePartitionGroups)
  const sendFault = useClusterStore(s => s.sendFault)

  const aliveNodes = useMemo(() => nodes.filter(n => n.alive), [nodes])
  const groupB = useMemo(
    () => aliveNodes.map(n => n.id).filter(id => !partitionGroupA.includes(id)),
    [aliveNodes, partitionGroupA]
  )

  const canConfirmGroupA =
    partitionGroupA.length > 0 && partitionGroupA.length < aliveNodes.length

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      cancelAction()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelAction])

  function triggerAction(mode) {
    setOpen(false)

    // Treat partition as a single flow so users can toggle it off in one tap.
    if (mode === 'partition-select' && actionMode?.startsWith('partition')) {
      cancelAction()
      return
    }
    if (actionMode === mode) {
      cancelAction()
      return
    }
    beginAction(mode)
  }

  function confirmGroupA() {
    if (!canConfirmGroupA) return
    goPartitionConfirm()
  }

  function commitPartition() {
    if (!sendFault || partitionGroupA.length === 0 || groupB.length === 0) return
    sendFault('partition', [], [partitionGroupA, groupB], '')
    setActivePartitionGroups([partitionGroupA, groupB])
    cancelAction()
  }

  return (
    <div className={styles.wrap}>
      {actionMode && (
        <div className={styles.modePanel}>
          {(actionMode === 'kill' || actionMode === 'restart' || actionMode === 'heal') && (
            <div className={styles.modeText}>Tap a highlighted node on canvas · ESC cancel</div>
          )}

          {actionMode === 'partition-select' && (
            <>
              <div className={styles.modeText}>Step 1/2 · Select Group A</div>
              <div className={styles.modeSubText}>
                {`Group A ${partitionGroupA.length}/${aliveNodes.length}`}
              </div>
              <div className={styles.modeActions}>
                <button className={styles.modeBtn} onClick={cancelAction}>Cancel</button>
                <button
                  className={`${styles.modeBtn} ${styles.modeBtnPrimary}`}
                  onClick={confirmGroupA}
                  disabled={!canConfirmGroupA}
                >
                  Confirm
                </button>
              </div>
            </>
          )}

          {actionMode === 'partition-confirm' && (
            <>
              <div className={styles.modeText}>Step 2/2 · Confirm partition</div>
              <div className={styles.modeSubText}>
                {`A: ${partitionGroupA.join(', ') || '—'} | B: ${groupB.join(', ') || '—'}`}
              </div>
              <div className={styles.modeActions}>
                <button className={styles.modeBtn} onClick={cancelAction}>Cancel</button>
                <button
                  className={`${styles.modeBtn} ${styles.modeBtnPrimary}`}
                  onClick={commitPartition}
                >
                  Partition
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.stack}>
        {ACTIONS.map((item, idx) => (
          <button
            key={item.key}
            className={[
              styles.actionBtn,
              open ? styles.actionBtnOpen : '',
              item.danger ? styles.actionBtnDanger : '',
            ].filter(Boolean).join(' ')}
            style={{ '--i': idx }}
            onClick={() => triggerAction(item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button
        className={`${styles.mainBtn} ${open ? styles.mainBtnOpen : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Toggle actions"
      >
        +
      </button>
    </div>
  )
}
