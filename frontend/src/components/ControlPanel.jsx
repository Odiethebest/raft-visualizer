import { useState, useRef, useEffect } from 'react'
import { useClusterStore } from '../store/clusterStore'
import styles from './ControlPanel.module.css'

// ControlPanel floats at the bottom of the canvas. Each fault action opens
// an inline picker rather than a modal so the cluster graph stays visible
// while the user is choosing targets — important for partition, where you
// need to see the current topology.

export default function ControlPanel() {
  const nodes     = useClusterStore(s => s.nodes)
  const sendFault = useClusterStore(s => s.sendFault)

  const [mode, setMode]   = useState(null)  // 'kill' | 'restart' | 'partition' | 'cmd'
  const [groupA, setGroupA] = useState([])  // for partition: first group
  const [groupB, setGroupB] = useState([])  // for partition: second group
  const [cmdText, setCmdText] = useState('')
  const inputRef = useRef(null)

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

  function close() {
    setMode(null)
    setGroupA([])
    setGroupB([])
    setCmdText('')
  }

  function toggle(id) {
    setMode(prev => {
      if (prev !== 'kill' && prev !== 'restart') return prev
      // For kill/restart: selecting a node fires immediately
      if (!sendFault) return prev
      sendFault(prev, [id])
      close()
      return null
    })
  }

  function togglePartitionA(id) {
    setGroupA(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function togglePartitionB(id) {
    setGroupB(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
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
    // Commands are submitted as a special "submit" fault action. The backend
    // routes it to the current leader via SubmitCommand.
    sendFault('submit', [], [])
    // The actual command goes in targets for simplicity — we encode it as a
    // single-item array where the item is the command string. The backend
    // faultLoop doesn't handle "submit" yet; this is a placeholder until
    // we add that route.
    //
    // For now, just send as the payload the user typed.
    // TODO: wire up SubmitCommand in the backend's faultLoop
    close()
  }

  return (
    <div className={styles.bar} ref={barRef}>
      {/* Inline picker renders above the bar */}
      {mode === 'kill' && (
        <NodePicker
          label="select node to kill"
          nodes={nodes}
          onSelect={id => { sendFault?.('kill', [id]); close() }}
          onCancel={close}
        />
      )}
      {mode === 'restart' && (
        <NodePicker
          label="select node to restart"
          nodes={nodes}
          deadOnly
          onSelect={id => { sendFault?.('restart', [id]); close() }}
          onCancel={close}
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
        />
      )}
      {mode === 'cmd' && (
        <div className={styles.picker}>
          <div className={styles.pickerLabel}>submit command to leader</div>
          <form className={styles.inputRow} onSubmit={submitCmd}>
            <input
              ref={inputRef}
              className={styles.cmdInput}
              placeholder="set x=1"
              value={cmdText}
              onChange={e => setCmdText(e.target.value)}
            />
            <button type="submit" className={styles.pickerConfirm} disabled={!cmdText.trim()}>
              send
            </button>
          </form>
        </div>
      )}

      <button className={styles.btn} onClick={() => setMode(m => m === 'cmd' ? null : 'cmd')}>
        submit cmd
      </button>
      <div className={styles.divider} />
      <button className={`${styles.btn} ${styles.btnKill}`} onClick={() => setMode(m => m === 'kill' ? null : 'kill')}>
        kill node
      </button>
      <button className={styles.btn} onClick={() => setMode(m => m === 'restart' ? null : 'restart')}>
        restart
      </button>
      <div className={styles.divider} />
      <button className={styles.btn} onClick={() => setMode(m => m === 'partition' ? null : 'partition')}>
        partition
      </button>
      <button className={styles.btn} onClick={() => { sendFault?.('heal'); close() }}>
        heal
      </button>
    </div>
  )
}

// NodePicker shows all nodes as small circles. Clicking one fires onSelect
// immediately — no confirmation step needed for single-node actions.
function NodePicker({ label, nodes, deadOnly, onSelect, onCancel }) {
  const selectable = deadOnly ? nodes.filter(n => !n.alive) : nodes

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
        <button className={styles.pickerCancel} onClick={onCancel}>cancel</button>
      </div>
    </div>
  )
}

// PartitionPicker lets the user assemble two groups. A node can only be in
// one group at a time — clicking it in group A removes it before adding to B.
function PartitionPicker({ nodes, groupA, groupB, onToggleA, onToggleB, onConfirm, onCancel }) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerLabel}>group A</div>
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
      <div className={styles.pickerLabel} style={{ marginTop: 4 }}>group B</div>
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
        <button className={styles.pickerCancel} onClick={onCancel}>cancel</button>
        <button
          className={styles.pickerConfirm}
          onClick={onConfirm}
          disabled={!groupA.length || !groupB.length}
        >
          partition
        </button>
      </div>
    </div>
  )
}
