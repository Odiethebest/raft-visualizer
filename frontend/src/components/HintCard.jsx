import { useState, useEffect, useRef } from 'react'
import { useClusterStore } from '../store/clusterStore'
import styles from './HintCard.module.css'

// HintCard sits in the top-right of the canvas and explains visual states
// and key interactions. It dismisses automatically when the user selects
// a node (showing they've figured out the primary interaction), or manually
// via the close button. We don't show it again after dismissal — localStorage
// keeps the preference across refreshes.

const DISMISSED_KEY = 'raft-hint-dismissed'
export const HINT_REOPEN_EVENT = 'raft:reopen-hint'
const ZH = 'zh'

export default function HintCard() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === 'true'
  )
  const selectedNodeId = useClusterStore(s => s.selectedNodeId)
  const lang = useClusterStore(s => s.lang)
  const prevSelectedNodeId = useRef(selectedNodeId)
  const isZh = lang === ZH

  // Auto-dismiss the first time the user clicks a node — they've discovered
  // the main interaction on their own and don't need the prompt anymore.
  // This runs as an effect (not during render) to avoid side-effects in the
  // render phase, which React's concurrent mode doesn't allow.
  useEffect(() => {
    const changed = prevSelectedNodeId.current !== selectedNodeId
    if (!dismissed && changed && selectedNodeId !== null) {
      localStorage.setItem(DISMISSED_KEY, 'true')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(true)
    }
    prevSelectedNodeId.current = selectedNodeId
  }, [dismissed, selectedNodeId])

  useEffect(() => {
    function reopen() {
      localStorage.removeItem(DISMISSED_KEY)
      setDismissed(false)
    }
    window.addEventListener(HINT_REOPEN_EVENT, reopen)
    return () => window.removeEventListener(HINT_REOPEN_EVENT, reopen)
  }, [])

  if (dismissed) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>{isZh ? '玩法教程 Guide' : 'Guide'}</span>
        <button className={styles.close} onClick={dismiss} aria-label={isZh ? '关闭 close' : 'dismiss'}>×</button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchLeader}`} />
          {isZh ? 'Leader 领导者 — 所有写请求都先到这里' : 'Leader — all client writes go through this node'}
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchFollower}`} />
          {isZh ? 'Follower 跟随者 — 被动接收并复制日志' : 'Follower — passively receives replicated log entries'}
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchCandidate}`} />
          {isZh ? 'Candidate 候选者 — 正在发起选举' : 'Candidate — currently campaigning for leadership'}
        </div>
        <div className={styles.legendRow}>
          <div className={`${styles.swatch} ${styles.swatchDead}`} />
          {isZh ? 'Dead 故障节点 — 模拟 crash' : 'Offline — simulated crash state'}
        </div>
      </div>

      <div className={styles.tips}>
        <div className={styles.tip}>
          <span className={styles.tipKey}>1.</span>
          {isZh
            ? '点击任意 node，在右侧面板查看状态和日志。'
            : 'Click any node to inspect its state and log in the right panel.'}
        </div>
        <div className={styles.tip}>
          <span className={styles.tipKey}>2.</span>
          {isZh
            ? '使用底部控制栏执行 submit cmd、kill/restart、partition/heal。'
            : 'Use the bottom control bar to submit commands and inject failures.'}
        </div>
        <div className={styles.tip}>
          <span className={styles.tipKey}>3.</span>
          {isZh
            ? '连线上的 moving dots 是 in-flight RPC：深色偏选举，浅色偏心跳复制。'
            : 'Moving dots indicate in-flight RPC traffic: darker for election, lighter for heartbeat/replication.'}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{isZh ? 'submit cmd 可输入内容' : 'What `Submit Cmd` Accepts'}</div>
        <div className={styles.line}>
          {isZh
            ? '`submit cmd` 接受任意文本字符串。后端不会解析业务语义，只把它当作 log entry 复制到集群。'
            : '`Submit Cmd` accepts arbitrary text. The backend does not execute business logic; it only replicates the command as a Raft log entry.'}
        </div>
        <div className={styles.cmdList}>
          <div className={styles.cmdRow}>
            <code>set x=1</code>
            <span>{isZh ? '基础写入示例，观察日志从 Leader 复制到 Followers。' : 'Basic write example to observe Leader-to-Follower replication.'}</span>
          </div>
          <div className={styles.cmdRow}>
            <code>set user:42 status=online</code>
            <span>{isZh ? '模拟业务状态更新，验证长文本命令的复制行为。' : 'Simulates an application state update with a longer payload.'}</span>
          </div>
          <div className={styles.cmdRow}>
            <code>transfer A-&gt;B 20</code>
            <span>{isZh ? '模拟交易命令，观察何时从 pending 变 committed。' : 'Represents a transactional command; watch pending entries become committed.'}</span>
          </div>
          <div className={styles.cmdRow}>
            <code>config featureX=true</code>
            <span>{isZh ? '模拟配置变更，适合测试连续提交。' : 'Represents a configuration update for repeated-commit testing.'}</span>
          </div>
        </div>
        <div className={styles.line}>
          {isZh ? '命令会出现在右侧 ' : 'Commands appear in '}
          <code>log entries</code>
          {isZh
            ? '：灰点表示未提交，绿点表示已被多数节点确认提交。'
            : ': gray indicates uncommitted, green indicates majority-committed.'}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{isZh ? 'Raft 算法速览' : 'Raft Quick Primer'}</div>
        <div className={styles.raftList}>
          <div>
            <strong>{isZh ? '角色 Role：' : 'Roles:'}</strong>
            {isZh ? '节点在 Follower / Candidate / Leader 三态之间切换。' : 'Nodes transition among Follower, Candidate, and Leader states.'}
          </div>
          <div>
            <strong>{isZh ? '选主 Election：' : 'Leader Election:'}</strong>
            {isZh ? 'Follower 选举超时后发起投票，获得多数票即成为 Leader。' : 'A follower starts an election on timeout and becomes leader after winning a majority vote.'}
          </div>
          <div>
            <strong>{isZh ? '日志复制 Replication：' : 'Log Replication:'}</strong>
            {isZh ? '客户端命令写入 Leader，再通过 AppendEntries 复制到其他节点。' : 'Client commands are accepted by the leader and replicated via AppendEntries.'}
          </div>
          <div>
            <strong>{isZh ? '提交 Commit：' : 'Commit Rule:'}</strong>
            {isZh ? '日志被多数节点确认后才 committed，随后可对外可见。' : 'An entry is committed only after majority replication and then becomes externally visible.'}
          </div>
          <div>
            <strong>{isZh ? '容错 Fault Tolerance：' : 'Fault Tolerance:'}</strong>
            {isZh ? '5 节点集群可容忍最多 2 个节点失效，仍可维持共识。' : 'A 5-node cluster tolerates up to 2 node failures while preserving consensus.'}
          </div>
        </div>
      </div>
    </div>
  )
}
