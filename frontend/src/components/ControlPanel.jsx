import { useState, useRef, useEffect } from 'react'
import { useClusterStore } from '../store/clusterStore'
import { controlCopy } from '../i18n/uiText'
import styles from './ControlPanel.module.css'

// ControlPanel floats at the bottom of the canvas. Each fault action opens
// an inline picker rather than a modal so the cluster graph stays visible
// while the user is choosing targets — important for partition, where you
// need to see the current topology.

export default function ControlPanel() {
  const nodes     = useClusterStore(s => s.nodes)
  const sendFault = useClusterStore(s => s.sendFault)
  const lang      = useClusterStore(s => s.lang)
  const text      = controlCopy(lang)

  const [mode, setMode]   = useState(null)  // 'kill' | 'restart' | 'partition' | 'cmd'
  const [groupA, setGroupA] = useState([])  // for partition: first group
  const [groupB, setGroupB] = useState([])  // for partition: second group
  const [cmdText, setCmdText] = useState('')
  const inputRef = useRef(null)

  function close() {
    setMode(null)
    setGroupA([])
    setGroupB([])
    setCmdText('')
  }

  // Close the picker when the user clicks outside of it
  const barRef = useRef(null)
  useEffect(() => {
    if (!mode) return
    function onDown(e) {
      if (barRef.current && !barRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [mode])

  useEffect(() => {
    if (mode === 'cmd') inputRef.current?.focus()
  }, [mode])

  function togglePartitionA(id) {
    setGroupA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setGroupB(prev => prev.filter(x => x !== id))
  }

  function togglePartitionB(id) {
    setGroupB(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setGroupA(prev => prev.filter(x => x !== id))
  }

  function confirmPartition() {
    if (groupA.length && groupB.length && sendFault) {
      sendFault('partition', [], [groupA, groupB])
      close()
    }
  }

  function submitCmd(e) {
    e.preventDefault()
    if (!cmdText.trim() || !sendFault) return
    sendFault('submit', [], [], cmdText.trim())
    close()
  }

  return (
    <div className={styles.bar} ref={barRef}>
      {/* Inline picker renders above the bar */}
      {mode === 'kill' && (
        <NodePicker
          label={text.pickKill}
          nodes={nodes}
          onSelect={id => { sendFault?.('kill', [id]); close() }}
          onCancel={close}
          cancelLabel={text.cancel}
        />
      )}
      {mode === 'restart' && (
        <NodePicker
          label={text.pickRestart}
          nodes={nodes}
          deadOnly
          onSelect={id => { sendFault?.('restart', [id]); close() }}
          onCancel={close}
          cancelLabel={text.cancel}
        />
      )}
      {mode === 'partition' && (
        <PartitionPicker
          nodes={nodes}
          groupA={groupA}
          groupB={groupB}
          onToggleA={togglePartitionA}
          onToggleB={togglePartitionB}
          onConfirm={confirmPartition}
          onCancel={close}
          groupALabel={text.groupA}
          groupBLabel={text.groupB}
          cancelLabel={text.cancel}
          confirmLabel={text.confirmPartition}
        />
      )}
      {mode === 'cmd' && (
        <div className={styles.picker}>
          <div className={styles.pickerLabel}>{text.submitToLeader}</div>
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

      <button className={styles.btn} onClick={() => setMode(m => m === 'cmd' ? null : 'cmd')}>
        {text.submitCmd}
      </button>
      <div className={styles.divider} />
      <button className={`${styles.btn} ${styles.btnKill}`} onClick={() => setMode(m => m === 'kill' ? null : 'kill')}>
        {text.killNode}
      </button>
      <button className={styles.btn} onClick={() => setMode(m => m === 'restart' ? null : 'restart')}>
        {text.restart}
      </button>
      <div className={styles.divider} />
      <button className={styles.btn} onClick={() => setMode(m => m === 'partition' ? null : 'partition')}>
        {text.partition}
      </button>
      <button className={styles.btn} onClick={() => { sendFault?.('heal'); close() }}>
        {text.heal}
      </button>
    </div>
  )
}

// NodePicker shows all nodes as small circles. Clicking one fires onSelect
// immediately — no confirmation step needed for single-node actions.
function NodePicker({ label, nodes, deadOnly, onSelect, onCancel, cancelLabel }) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerLabel}>{label}</div>
      <div className={styles.nodeRow}>
        {nodes.map(n => {
          const disabled = deadOnly ? n.alive : false
          return (
            <button
              key={n.id}
              className={`${styles.nodeBtn} ${!n.alive ? styles.nodeBtnDead : ''}`}
              disabled={disabled}
              onClick={() => onSelect(n.id)}
            >
              {n.id}
            </button>
          )
        })}
      </div>
      <div className={styles.pickerActions}>
        <button className={styles.pickerCancel} onClick={onCancel}>{cancelLabel}</button>
      </div>
    </div>
  )
}

// PartitionPicker lets the user assemble two groups. A node can only be in
// one group at a time — clicking it in group A removes it before adding to B.
function PartitionPicker({
  nodes,
  groupA,
  groupB,
  onToggleA,
  onToggleB,
  onConfirm,
  onCancel,
  groupALabel,
  groupBLabel,
  cancelLabel,
  confirmLabel,
}) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerLabel}>{groupALabel}</div>
      <div className={styles.nodeRow}>
        {nodes.map(n => (
          <button
            key={n.id}
            className={`${styles.nodeBtn} ${groupA.includes(n.id) ? styles.nodeBtnSelected : ''}`}
            onClick={() => onToggleA(n.id)}
          >
            {n.id}
          </button>
        ))}
      </div>
      <div className={styles.pickerLabel} style={{ marginTop: 4 }}>{groupBLabel}</div>
      <div className={styles.nodeRow}>
        {nodes.map(n => (
          <button
            key={n.id}
            className={`${styles.nodeBtn} ${groupB.includes(n.id) ? styles.nodeBtnSelected : ''}`}
            onClick={() => onToggleB(n.id)}
          >
            {n.id}
          </button>
        ))}
      </div>
      <div className={styles.pickerActions}>
        <button className={styles.pickerCancel} onClick={onCancel}>{cancelLabel}</button>
        <button
          className={styles.pickerConfirm}
          onClick={onConfirm}
          disabled={!groupA.length || !groupB.length}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
