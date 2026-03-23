import { useEffect, useMemo, useRef, useState } from 'react'
import { useClusterStore } from '../store/clusterStore'
import { controlCopy } from '../i18n/uiText'
import styles from './ControlPanel.module.css'

export default function ControlPanel() {
  const nodes = useClusterStore(s => s.nodes)
  const sendFault = useClusterStore(s => s.sendFault)
  const lang = useClusterStore(s => s.lang)
  const actionMode = useClusterStore(s => s.actionMode)
  const partitionGroupA = useClusterStore(s => s.partitionGroupA)
  const beginAction = useClusterStore(s => s.beginAction)
  const cancelAction = useClusterStore(s => s.cancelAction)
  const goPartitionConfirm = useClusterStore(s => s.goPartitionConfirm)
  const setActivePartitionGroups = useClusterStore(s => s.setActivePartitionGroups)
  const text = controlCopy(lang)

  const [cmdText, setCmdText] = useState('')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const inputRef = useRef(null)
  const barRef = useRef(null)

  const aliveNodes = useMemo(() => nodes.filter(n => n.alive), [nodes])
  const groupB = useMemo(
    () => aliveNodes.map(n => n.id).filter(id => !partitionGroupA.includes(id)),
    [aliveNodes, partitionGroupA]
  )
  const showEscHint = Boolean((actionMode && actionMode !== 'cmd') || tutorialOpen)

  function closeAction() {
    cancelAction()
    setCmdText('')
  }

  useEffect(() => {
    const closeOnOutside = actionMode === 'cmd' || tutorialOpen
    if (!closeOnOutside) return
    function onDown(e) {
      if (barRef.current && !barRef.current.contains(e.target)) {
        // Keeping node-targeted fault modes open avoids accidental exits
        // before users can click a node on the canvas.
        if (actionMode === 'cmd') {
          cancelAction()
          setCmdText('')
        }
        if (tutorialOpen) setTutorialOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [actionMode, tutorialOpen, cancelAction])

  useEffect(() => {
    if (actionMode === 'cmd') inputRef.current?.focus()
  }, [actionMode])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && (actionMode || tutorialOpen)) {
        e.preventDefault()
        cancelAction()
        setCmdText('')
        setTutorialOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionMode, tutorialOpen, cancelAction])

  function submitCmd(e) {
    e.preventDefault()
    if (!cmdText.trim() || !sendFault) return
    sendFault('submit', [], [], cmdText.trim())
    closeAction()
  }

  function confirmPartitionA() {
    if (partitionGroupA.length === 0 || partitionGroupA.length === aliveNodes.length) return
    goPartitionConfirm()
  }

  function sendPartition() {
    if (!sendFault) return
    if (partitionGroupA.length === 0 || groupB.length === 0) return
    sendFault('partition', [], [partitionGroupA, groupB], '')
    setActivePartitionGroups([partitionGroupA, groupB])
    closeAction()
  }

  function startAction(mode) {
    // Fault pickers and long-form tutorial share the same visual space;
    // collapsing one before opening the other prevents panel overlap.
    setTutorialOpen(false)
    if (actionMode === mode) {
      closeAction()
      return
    }
    beginAction(mode)
  }

  function toggleTutorial() {
    if (tutorialOpen) {
      setTutorialOpen(false)
      return
    }
    cancelAction()
    setCmdText('')
    setTutorialOpen(true)
  }

  function handleHealClick() {
    startAction('heal')
  }

  const canConfirmGroupA = partitionGroupA.length > 0 && partitionGroupA.length < aliveNodes.length

  return (
    <div className={styles.bar} ref={barRef}>
      {tutorialOpen && (
        <div className={styles.tutorialPanel}>
          <div className={styles.tutorialHeader}>
            <div className={styles.tutorialTitle}>{text.tutorialTitle}</div>
            <button className={styles.pickerCancel} onClick={() => setTutorialOpen(false)}>
              {text.tutorialClose}
            </button>
          </div>
          <p className={styles.tutorialIntro}>{text.tutorialIntro}</p>

          <div className={styles.tutorialSection}>
            <div className={styles.tutorialSectionTitle}>{text.tutorialCmds}</div>
            <div className={styles.tutorialList}>
              {text.tutorialCmdExamples.map((item, idx) => (
                <div key={`${item.cmd}-${idx}`} className={styles.tutorialItem}>
                  <code className={styles.tutorialCmd}>{item.cmd}</code>
                  <span className={styles.tutorialDetail}>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.tutorialSection}>
            <div className={styles.tutorialSectionTitle}>{text.tutorialHow}</div>
            <div className={styles.tutorialList}>
              {text.tutorialHowItems.map((line, idx) => (
                <div key={`${line}-${idx}`} className={styles.tutorialItem}>
                  <span className={styles.tutorialStepNo}>{idx + 1}.</span>
                  <span className={styles.tutorialDetail}>{line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.tutorialSection}>
            <div className={styles.tutorialSectionTitle}>{text.tutorialRaft}</div>
            <div className={styles.tutorialList}>
              {text.tutorialRaftItems.map((line, idx) => (
                <div key={`${line}-${idx}`} className={styles.tutorialItem}>
                  <span className={styles.tutorialDetail}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {actionMode === 'cmd' && (
        <div className={styles.inlinePanel}>
          <div className={styles.inlineTitle}>{text.submitToLeader}</div>
          <form className={styles.inputRow} onSubmit={submitCmd}>
            <input
              ref={inputRef}
              className={styles.cmdInput}
              placeholder={text.cmdPlaceholder}
              value={cmdText}
              onChange={e => setCmdText(e.target.value)}
            />
            <button type="submit" className={styles.pickerConfirm} disabled={!cmdText.trim()}>
              {text.send}
            </button>
          </form>
        </div>
      )}

      {actionMode === 'partition-select' && (
        <div className={styles.inlinePanel}>
          <div className={styles.inlineTitle}>{text.partitionStepA}</div>
          <div className={styles.inlineHint}>{text.partitionChooseHint}</div>
          <div className={styles.inlinePreview}>
            {text.partitionPreviewA}: {partitionGroupA.length} / {aliveNodes.length}
          </div>
          <div className={styles.pickerActions}>
            <button className={styles.pickerCancel} onClick={closeAction}>{text.cancel}</button>
            <button
              className={styles.pickerConfirm}
              onClick={confirmPartitionA}
              disabled={!canConfirmGroupA}
            >
              {text.confirmGroupA}
            </button>
          </div>
        </div>
      )}

      {actionMode === 'partition-confirm' && (
        <div className={styles.inlinePanel}>
          <div className={styles.inlineTitle}>{text.partitionStepB}</div>
          <div className={styles.groupLine}>
            <span className={styles.groupLabel}>{text.partitionPreviewA}</span>
            <span className={styles.groupVal}>{partitionGroupA.join(', ') || '—'}</span>
          </div>
          <div className={styles.groupLine}>
            <span className={styles.groupLabel}>{text.partitionPreviewB}</span>
            <span className={styles.groupVal}>{groupB.join(', ') || '—'}</span>
          </div>
          <div className={styles.pickerActions}>
            <button className={styles.pickerCancel} onClick={closeAction}>{text.cancel}</button>
            <button className={styles.pickerConfirm} onClick={sendPartition}>
              {text.confirmPartition}
            </button>
          </div>
        </div>
      )}

      {(actionMode === 'kill' || actionMode === 'restart' || actionMode === 'heal') && (
        <div className={styles.inlinePanel}>
          <div className={styles.inlineTitle}>
            {actionMode === 'kill' ? text.killSelecting : actionMode === 'restart' ? text.restartSelecting : text.healSelecting}
          </div>
          <div className={styles.inlineHint}>{text.escHint}</div>
        </div>
      )}

      <button className={`${styles.btn} ${actionMode === 'cmd' ? styles.btnActive : ''}`} onClick={() => startAction('cmd')}>
        {text.submitCmd}
      </button>
      <button className={`${styles.btn} ${tutorialOpen ? styles.btnActive : ''}`} onClick={toggleTutorial}>
        {text.tutorial}
      </button>
      <div className={styles.divider} />
      <button
        className={`${styles.btn} ${styles.btnKill} ${actionMode === 'kill' ? styles.btnActiveDanger : ''}`}
        onClick={() => startAction('kill')}
      >
        {actionMode === 'kill' ? text.killSelecting : text.killNode}
      </button>
      <button className={`${styles.btn} ${actionMode === 'restart' ? styles.btnActive : ''}`} onClick={() => startAction('restart')}>
        {text.restart}
      </button>
      <div className={styles.divider} />
      <button className={`${styles.btn} ${actionMode?.startsWith('partition') ? styles.btnActive : ''}`} onClick={() => startAction('partition-select')}>
        {text.partition}
      </button>
      <button className={`${styles.btn} ${actionMode === 'heal' ? styles.btnActive : ''}`} onClick={handleHealClick}>
        {text.heal}
      </button>
      {showEscHint && (
        <div className={styles.escHint}>{text.escHint}</div>
      )}
    </div>
  )
}
