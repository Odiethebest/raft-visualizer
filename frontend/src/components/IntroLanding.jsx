import { useEffect, useRef, useState } from 'react'
import styles from './IntroLanding.module.css'

const CHAPTERS = [
  {
    id: '01',
    navZh: '为什么需要 Consensus',
    navEn: 'Why Consensus Matters',
    titleZh: '为什么需要 Consensus',
    titleEn: 'Why Consensus Exists',
    subtitleZh: '没有共识就没有一致性',
    subtitleEn: 'Consistency Before Availability',
    summaryZh: '没有共识，副本状态会分叉。',
    summaryEn: 'Without consensus, replicas diverge.',
    bodyZh: (
      <>
        分布式系统把状态复制到多个节点以获得可用性，但只要出现消息乱序、延迟或节点故障，
        历史就可能分叉。Raft 通过 <code>quorum</code> 规则和严格的日志顺序，避免
        <code>split-brain</code> 带来的不一致。
      </>
    ),
    bodyEn: (
      <>
        Replication improves availability, but failures and out-of-order delivery
        can split history across nodes. Raft uses strict log ordering and
        <code>quorum</code> semantics to prevent <code>split-brain</code> state.
      </>
    ),
  },
  {
    id: '02',
    navZh: 'Raft 设计目标',
    navEn: 'Raft Design Goal',
    titleZh: 'Raft 设计目标',
    titleEn: 'Raft Design Goal',
    subtitleZh: '可理解性优先于复杂技巧',
    subtitleEn: 'Understandability as a Constraint',
    summaryZh: '可理解性优先于复杂技巧。',
    summaryEn: 'Understandability is a first-class goal.',
    bodyZh: (
      <>
        Raft 的核心是“可理解的共识”：单一领导者模型、清晰的任期推进和一致的日志检查。
        它把复杂性收敛到 <code>Leader</code>，让协议在工程上更容易验证、调试与教学。
      </>
    ),
    bodyEn: (
      <>
        Raft optimizes for understandability: strong leadership, explicit term
        progression, and deterministic log checks. By concentrating authority in
        the <code>Leader</code>, the protocol is easier to reason about and debug.
      </>
    ),
  },
  {
    id: '03',
    navZh: '角色模型 Role Model',
    navEn: 'Role Model',
    titleZh: '角色模型 Role Model',
    titleEn: 'Role Model',
    subtitleZh: '三种角色与单调任期',
    subtitleEn: 'Follower, Candidate, Leader',
    summaryZh: '三态切换，任期单调递增。',
    summaryEn: 'Three roles, monotonically increasing terms.',
    bodyZh: (
      <>
        每个节点只在 <code>Follower</code>、<code>Candidate</code>、
        <code>Leader</code> 三种角色中切换。任何节点看到更高
        <code>term</code> 都会立即降级，保证旧领导不会长期干扰系统。
      </>
    ),
    bodyEn: (
      <>
        Each node is always one of <code>Follower</code>, <code>Candidate</code>,
        or <code>Leader</code>. Seeing a higher <code>term</code> forces an
        immediate step-down, which prevents stale leaders from persisting.
      </>
    ),
  },
  {
    id: '04',
    navZh: '选举流程 Election',
    navEn: 'Election Flow',
    titleZh: '选举流程 Election',
    titleEn: 'Election Flow',
    subtitleZh: '超时、投票、当选',
    subtitleEn: 'Timeout, Vote, Leader',
    summaryZh: '超时触发投票，多数票选主。',
    summaryEn: 'Timeouts trigger voting; majority elects leader.',
    bodyZh: (
      <>
        Follower 在选举超时后提升任期并发送 <code>RequestVote</code>。
        拿到多数票的节点成为 Leader，并通过周期性 <code>heartbeat</code>
        抑制新一轮选举。
      </>
    ),
    bodyEn: (
      <>
        A timed-out follower increments term and sends <code>RequestVote</code>.
        Majority support promotes it to leader, and periodic <code>heartbeat</code>
        traffic keeps followers from starting competing elections.
      </>
    ),
  },
  {
    id: '05',
    navZh: '复制流程 Replication',
    navEn: 'Replication Flow',
    titleZh: '复制流程 Replication',
    titleEn: 'Replication Flow',
    subtitleZh: '先写主节点，再向多数复制',
    subtitleEn: 'AppendEntries and Commit',
    summaryZh: '先写 Leader，再向多数复制。',
    summaryEn: 'Leader first, then majority replication.',
    bodyZh: (
      <>
        客户端命令先追加到 Leader 日志，再通过 <code>AppendEntries</code>
        复制到 Follower。达到多数确认后，Leader 推进 <code>commitIndex</code>，
        集群才把该命令视为已提交。
      </>
    ),
    bodyEn: (
      <>
        Client commands are appended on the leader first, then replicated via
        <code>AppendEntries</code>. Once a majority acknowledges, the leader
        advances <code>commitIndex</code> and the entry becomes committed.
      </>
    ),
  },
  {
    id: '06',
    navZh: '安全性 Safety',
    navEn: 'Safety',
    titleZh: '安全性 Safety',
    titleEn: 'Safety',
    subtitleZh: '已提交条目不会回退',
    subtitleEn: 'Committed Means Durable',
    summaryZh: '已提交日志不会回退。',
    summaryEn: 'Committed entries do not roll back.',
    bodyZh: (
      <>
        Raft 依赖日志匹配性质与多数派约束来确保安全性：已提交条目不会因 Leader
        切换而丢失。只有日志足够新的节点才能赢得选举，这保证了
        <code>leader completeness</code>。
      </>
    ),
    bodyEn: (
      <>
        Safety comes from log matching plus majority constraints: committed entries
        survive leader changes. Elections require up-to-date logs, which enforces
        <code>leader completeness</code>.
      </>
    ),
  },
  {
    id: '07',
    navZh: '故障处理 Faults',
    navEn: 'Fault Handling',
    titleZh: '故障处理 Faults',
    titleEn: 'Fault Handling',
    subtitleZh: '崩溃、分区与恢复',
    subtitleEn: 'Crash, Partition, Recovery',
    summaryZh: '支持 crash / restart / partition / heal。',
    summaryEn: 'Crash, restart, partition, and heal are first-class.',
    bodyZh: (
      <>
        这个演示把故障作为主路径：你可以主动触发 <code>kill</code>、
        <code>restart</code>、<code>partition</code>、<code>heal</code>，
        直接观察法定人数、重选与日志修复行为。
      </>
    ),
    bodyEn: (
      <>
        Faults are part of the core workflow here: trigger <code>kill</code>,
        <code>restart</code>, <code>partition</code>, and <code>heal</code> to
        observe quorum boundaries, re-election, and log repair in real time.
      </>
    ),
  },
  {
    id: '08',
    navZh: '你将看到什么',
    navEn: 'What You Will See',
    titleZh: '你将看到什么',
    titleEn: 'What You Will See',
    subtitleZh: '从理论到实时信号',
    subtitleEn: 'From Theory to Runtime Signals',
    summaryZh: '状态、日志、RPC 与事件全可见。',
    summaryEn: 'State, logs, RPC flow, and events are visible.',
    bodyZh: (
      <>
        进入演示后，你会看到角色变化、term 推进、日志复制、提交状态和在途 RPC 动画。
        底部控制栏可实时提交 <code>submit cmd</code> 并注入故障，完整观察协议行为。
      </>
    ),
    bodyEn: (
      <>
        In the live demo, you will inspect role transitions, term progression,
        replication, commit status, and in-flight RPC animation. The control bar
        lets you issue <code>submit cmd</code> and inject faults instantly.
      </>
    ),
  },
]

function splitChars(text) {
  return Array.from(text)
}

export default function IntroLanding({ lang, onStart, onToggleLang }) {
  const isZh = lang === 'zh'
  const isMobile = useIsMobile()
  const headerTitle = isMobile
    ? 'Raft Visualizer'
    : (isZh ? 'Raft 可视化实验场' : 'Raft Consensus Visualizer')
  const pageRef = useRef(null)
  const chapterRefs = useRef(new Map())
  const mobileStateRef = useRef({})
  const mobileExitTimers = useRef(new Map())
  const [activeId, setActiveId] = useState(CHAPTERS[0].id)
  const [animated, setAnimated] = useState(() => new Set())
  const [mobileSectionState, setMobileSectionState] = useState({})

  function setChapterRef(id) {
    return (el) => {
      if (el) chapterRefs.current.set(id, el)
      else chapterRefs.current.delete(id)
    }
  }

  function markAnimated(id) {
    setAnimated(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  useEffect(() => {
    mobileStateRef.current = mobileSectionState
  }, [mobileSectionState])

  useEffect(() => {
    const timers = mobileExitTimers.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  useEffect(() => {
    const root = pageRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-chapter-id')
          if (!id) continue

          if (!isMobile) {
            if (entry.isIntersecting) markAnimated(id)
            continue
          }

          if (entry.isIntersecting) {
            const timer = mobileExitTimers.current.get(id)
            if (timer) {
              clearTimeout(timer)
              mobileExitTimers.current.delete(id)
            }
            setMobileSectionState(prev => (
              prev[id] === 'visible' ? prev : { ...prev, [id]: 'visible' }
            ))
            continue
          }

          if (mobileStateRef.current[id] !== 'visible') continue
          setMobileSectionState(prev => ({ ...prev, [id]: 'exiting' }))

          const prevTimer = mobileExitTimers.current.get(id)
          if (prevTimer) clearTimeout(prevTimer)
          const timer = window.setTimeout(() => {
            setMobileSectionState(prev => (
              prev[id] === 'exiting' ? { ...prev, [id]: 'idle' } : prev
            ))
            mobileExitTimers.current.delete(id)
          }, 400)
          mobileExitTimers.current.set(id, timer)
        }
      },
      { root, threshold: isMobile ? 0.4 : 0.33 }
    )

    for (const ch of CHAPTERS) {
      const el = chapterRefs.current.get(ch.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [isMobile])

  useEffect(() => {
    const root = pageRef.current
    if (!root) return

    let rafId = null

    // Scroll-synced navigation reduces orientation cost in long-form sections.
    function updateActive() {
      const rootRect = root.getBoundingClientRect()
      const probeY = rootRect.top + Math.min(220, rootRect.height * 0.28)

      let bestId = CHAPTERS[0].id
      let bestDist = Number.POSITIVE_INFINITY

      for (const ch of CHAPTERS) {
        const el = chapterRefs.current.get(ch.id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.bottom < probeY - 24) continue

        const dist = Math.abs(rect.top - probeY)
        if (dist < bestDist) {
          bestDist = dist
          bestId = ch.id
        }
      }

      setActiveId(prev => (prev === bestId ? prev : bestId))
    }

    function onScroll() {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateActive()
      })
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    updateActive()

    return () => {
      root.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  function scrollToChapter(id) {
    const target = chapterRefs.current.get(id)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function renderAnimatedLine(text, baseDelay, isShown, lineClassName) {
    const tokens = text.split(/(\s+)/)
    const nodes = []
    let offset = 0

    for (let tokenIdx = 0; tokenIdx < tokens.length; tokenIdx++) {
      const token = tokens[tokenIdx]
      if (/^\s+$/.test(token)) {
        nodes.push(<span key={`${text}-space-${tokenIdx}`}>{token}</span>)
        continue
      }

      const chars = splitChars(token)
      const tokenClass = /[A-Za-z0-9]/.test(token)
        ? styles.wordChunkLatin
        : styles.wordChunk
      const wordChars = chars.map((ch, i) => (
        <span
          key={`${text}-${tokenIdx}-${i}`}
          className={`${styles.char} ${isShown ? styles.charShown : ''}`}
          style={{ animationDelay: `${baseDelay + (offset + i) * 30}ms` }}
        >
          {ch}
        </span>
      ))
      offset += chars.length
      nodes.push(
        <span key={`${text}-word-${tokenIdx}`} className={tokenClass}>
          {wordChars}
        </span>
      )
    }

    return (
      <span className={`${styles.titleLine} ${lineClassName}`}>
        {nodes}
      </span>
    )
  }

  return (
    <div className={styles.page} ref={pageRef}>
      <header className={styles.topHeader}>
        <div className={styles.topHeaderLeft}>
          <h1 className={styles.pageTitle}>
            {headerTitle}
          </h1>
          <span className={styles.badge}>By Odie Yang</span>
        </div>
        <div className={styles.topHeaderRight}>
          <button className={styles.langBtn} onClick={onToggleLang}>
            {isZh ? 'EN' : 'ZH'}
          </button>
          <button className={styles.demoBtn} onClick={onStart}>
            Demo →
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        {!isMobile && (
          <aside className={styles.sidebar}>
            <nav className={styles.navList}>
              {CHAPTERS.map(ch => {
                const isActive = ch.id === activeId
                const summary = isZh ? ch.summaryZh : ch.summaryEn
                return (
                  <button
                    key={ch.id}
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => scrollToChapter(ch.id)}
                  >
                    <span className={`${styles.navTag} ${isActive ? styles.navTagActive : ''}`}>{ch.id}</span>
                    <span className={styles.navLabel}>{isZh ? ch.navZh : ch.navEn}</span>
                    <span className={styles.navSummary}>{summary}</span>
                  </button>
                )
              })}
            </nav>
          </aside>
        )}

        <main className={styles.content}>
          {CHAPTERS.map(ch => {
            const shown = isMobile ? true : animated.has(ch.id)
            const mobileState = mobileSectionState[ch.id] ?? 'idle'
            const mobileClass = isMobile
              ? [
                styles.sectionMobile,
                mobileState === 'visible' ? styles.visible : '',
                mobileState === 'exiting' ? styles.exiting : '',
              ].filter(Boolean).join(' ')
              : ''
            return (
              <section
                key={ch.id}
                ref={setChapterRef(ch.id)}
                data-chapter-id={ch.id}
                className={`${styles.chapter} ${mobileClass}`}
              >
                <div className={styles.chapterInner}>
                  <div className={`${styles.chapterIndex} ${shown ? styles.indexShown : ''}`}>
                    {ch.id}
                  </div>

                  <h2 className={styles.chapterTitle}>
                    {renderAnimatedLine(isZh ? ch.titleZh : ch.titleEn, 0, shown, styles.primaryLine)}
                    {renderAnimatedLine(isZh ? ch.subtitleZh : ch.subtitleEn, 120, shown, styles.secondaryLine)}
                  </h2>

                  <p className={`${styles.chapterBody} ${shown ? styles.bodyShown : ''}`}>
                    {isZh ? ch.bodyZh : ch.bodyEn}
                  </p>
                </div>
              </section>
            )
          })}

          <section className={styles.ctaSection}>
            <div className={styles.ctaInner}>
              <p className={styles.ctaHint}>
                {isZh ? '以上所有行为均可在演示中实时触发' : 'All behaviors above can be triggered in real time in the demo'}
              </p>
              <button className={styles.startBtn} onClick={onStart}>
                {isZh ? '开始演示 START DEMO' : 'START DEMO'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 768px)').matches
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const sync = () => setIsMobile(media.matches)
    sync()

    if (media.addEventListener) {
      media.addEventListener('change', sync)
      return () => media.removeEventListener('change', sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  return isMobile
}
