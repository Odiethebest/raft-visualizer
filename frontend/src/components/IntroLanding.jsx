import styles from './IntroLanding.module.css'

const EN_CARDS = [
  {
    title: 'Why Consensus Exists',
    body: 'Distributed systems replicate state across nodes. Without consensus, concurrent failures and reordered messages lead to divergent histories.',
  },
  {
    title: 'Raft Design Goal',
    body: 'Raft was designed for understandability: strict leadership, term-based elections, and log-matching rules that are practical to reason about.',
  },
  {
    title: 'Role Model',
    body: 'Each node is either Follower, Candidate, or Leader. Leadership is exclusive per term, and terms increase monotonically.',
  },
  {
    title: 'Election Flow',
    body: 'A follower that times out requests votes. A majority elects a leader. Heartbeats suppress new elections while leadership is healthy.',
  },
  {
    title: 'Replication Flow',
    body: 'Clients submit commands to the leader. The leader appends locally, replicates through AppendEntries, and commits after majority confirmation.',
  },
  {
    title: 'Safety Rule',
    body: 'Committed entries remain durable across leader changes because up-to-date logs are required to win elections.',
  },
  {
    title: 'Failure Handling',
    body: 'Crash, restart, partition, and heal scenarios are first-class controls in this demo so you can observe quorum behavior directly.',
  },
  {
    title: 'What You Will See',
    body: 'State transitions, terms, leader changes, in-flight RPCs, log replication, and commit progression in a live 5-node cluster.',
  },
]

const ZH_CARDS = [
  {
    title: '为什么需要 Consensus',
    body: '分布式系统需要多节点复制状态。没有共识协议时，故障和消息乱序会让各节点历史不一致。',
  },
  {
    title: 'Raft 设计目标',
    body: 'Raft 强调可理解性：single leader、term 驱动选举、以及可验证的 log matching 规则。',
  },
  {
    title: '角色模型 Role Model',
    body: '每个节点只能处于 Follower / Candidate / Leader 之一；同一 term 只允许一个 Leader。',
  },
  {
    title: '选举流程 Election',
    body: 'Follower 超时后发起投票请求，拿到多数票就成为 Leader；心跳持续抑制新的选举。',
  },
  {
    title: '复制流程 Replication',
    body: '客户端命令先进入 Leader 日志，再通过 AppendEntries 复制，达到多数后才 commit。',
  },
  {
    title: '安全性 Safety',
    body: '已提交日志在 Leader 切换后仍可保留，因为只有日志足够新的节点才能赢得选举。',
  },
  {
    title: '故障处理 Faults',
    body: '你可以直接注入 crash / restart / partition / heal，观察 quorum 与恢复行为。',
  },
  {
    title: '你将看到什么',
    body: '实时状态转换、term 变化、选主、RPC 流动、日志复制和提交推进的完整过程。',
  },
]

export default function IntroLanding({ lang, onStart, onToggleLang }) {
  const isZh = lang === 'zh'
  const cards = isZh ? ZH_CARDS : EN_CARDS

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <span className={styles.badge}>
            {isZh ? 'CS6650 Distributed Systems Project' : 'CS6650 Distributed Systems Project'}
          </span>
          <button className={styles.langBtn} onClick={onToggleLang}>
            {isZh ? 'EN' : '中文'}
          </button>
        </div>

        <h1 className={styles.title}>
          {isZh ? 'Raft 可视化实验场' : 'Raft Consensus Visualizer'}
        </h1>
        <p className={styles.sub}>
          {isZh
            ? '先快速理解算法，再进入实时演示。关闭页面后后端集群会自动休眠，下一次访问再启动。'
            : 'Learn the protocol quickly, then enter the live simulation. The backend cluster sleeps automatically when no clients are connected.'}
        </p>

        <button className={styles.startBtn} onClick={onStart}>
          {isZh ? '开始演示 Start Demo' : 'Start Demo'}
        </button>
      </header>

      <section className={styles.waterfall}>
        {cards.map(card => (
          <article key={card.title} className={styles.card}>
            <h2 className={styles.cardTitle}>{card.title}</h2>
            <p className={styles.cardBody}>{card.body}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
