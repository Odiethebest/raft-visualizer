import { useEffect, useRef, useState } from 'react'
import { useClusterStore } from './store/clusterStore'
import { useRaftWS } from './hooks/useRaftWS'
import ClusterView from './components/ClusterView'
import LogPanel from './components/LogPanel'
import EventStream from './components/EventStream'
import ControlPanel from './components/ControlPanel'
import MobileDrawer from './components/MobileDrawer'
import MobileFab from './components/MobileFab'
import IntroLanding from './components/IntroLanding'
import { appCopy, wsStatusLabel } from './i18n/uiText'
import './App.css'

export default function App() {
  const [started, setStarted] = useState(false)
  const lang = useClusterStore(s => s.lang)
  const toggleLang = useClusterStore(s => s.toggleLang)

  if (!started) {
    return (
      <IntroLanding
        lang={lang}
        onStart={() => setStarted(true)}
        onToggleLang={toggleLang}
      />
    )
  }

  return <LiveDemoApp onBack={() => setStarted(false)} />
}

function LiveDemoApp({ onBack }) {
  // useRaftWS owns the WebSocket lifecycle. It only mounts after the user
  // clicks "Start Demo", and unmounts when the page closes.
  useRaftWS()

  const isMobile = useIsMobile()
  const nodes    = useClusterStore(s => s.nodes)
  const wsStatus = useClusterStore(s => s.wsStatus)
  const lang     = useClusterStore(s => s.lang)
  const toggleLang = useClusterStore(s => s.toggleLang)
  const eventLogOpen = useClusterStore(s => s.eventLogOpen)
  const toggleEventLog = useClusterStore(s => s.toggleEventLog)
  const sendClientCommand = useClusterStore(s => s.sendClientCommand)
  const [drawerMode, setDrawerMode] = useState('collapsed')
  const [mobileDrawerTab, setMobileDrawerTab] = useState('node')
  const [mobileFitSignal, setMobileFitSignal] = useState(0)
  const fitTimerRef = useRef(null)

  const leader = nodes.find(n => n.role === 'leader' && n.alive)
  const alive  = nodes.filter(n => n.alive).length
  const text = appCopy(lang)

  function handleFastTap(action) {
    return (e) => {
      e.preventDefault()
      action()
    }
  }

  function canvasHeightFor(mode) {
    if (mode === 'full') return 'calc(100vh - 40px - 85vh)'
    if (mode === 'half') return 'calc(100vh - 40px - 50vh)'
    return 'calc(100vh - 40px - 40px)'
  }

  function scheduleMobileRefit() {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    // fitView must run after canvas height transition settles; otherwise
    // ReactFlow measures an in-between height and recenters incorrectly.
    fitTimerRef.current = setTimeout(() => {
      setMobileFitSignal(v => v + 1)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isMobile) return
    scheduleMobileRefit()
  }, [isMobile, drawerMode])

  if (isMobile) {
    const mobileBackLabel = lang === 'zh' ? '返回' : 'Back'

    return (
      <div className="app mobileApp">
        <header className="header mobileHeader">
          <div className="mobileHeaderLeft">
            <button className="mobileHeaderBtn" onPointerDown={handleFastTap(onBack)}>
              {mobileBackLabel}
            </button>
            <span className="mobileHeaderTitle">Raft Consensus · By Odie Yang</span>
          </div>
          <div className="mobileHeaderRight">
            <button className="mobileHeaderBtn" onPointerDown={handleFastTap(toggleLang)}>
              {text.langToggle}
            </button>
            <StatusPill status={wsStatus} lang={lang} compact />
          </div>
        </header>

        <div className="main mobileMain">
          <div
            className="canvasArea mobileCanvasArea"
            style={{ '--canvas-height': canvasHeightFor(drawerMode) }}
          >
            <ClusterView
              fitSignal={mobileFitSignal}
              onNodeSelected={() => {
                setMobileDrawerTab('node')
                setDrawerMode('half')
                scheduleMobileRefit()
              }}
              onPaneTap={() => {
                setDrawerMode(prev => (prev === 'collapsed' ? prev : 'collapsed'))
              }}
            />
          </div>
          <MobileFab />
          <MobileDrawer
            mode={drawerMode}
            onModeChange={setDrawerMode}
            tab={mobileDrawerTab}
            onTabChange={setMobileDrawerTab}
            leader={leader}
            aliveCount={alive}
            totalCount={nodes.length}
            onSubmitCommand={(command) => sendClientCommand?.(command)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="headerLeft">
          <button className="headerActionBtn headerBackBtn" onClick={onBack}>
            {text.back}
          </button>
          <div className="headerBrand">
            <span className="headerTitle">{text.title}</span>
            <span className="headerSub">{text.sub}</span>
          </div>
        </div>
        <div className="headerRight">
          {leader && (
            <div className="headerStat">
              <span className="headerStatLabel">{text.leader}</span>
              <span className="headerStatValue">{text.node} {leader.id}</span>
            </div>
          )}
          <div className="headerStat">
            <span className="headerStatLabel">{text.term}</span>
            <span className="headerStatValue">{leader?.term ?? '—'}</span>
          </div>
          <div className="headerStat">
            <span className="headerStatLabel">{text.alive}</span>
            <span className="headerStatValue">{alive} / {nodes.length}</span>
          </div>
          <button className="headerActionBtn" onClick={toggleEventLog}>
            {text.eventLogToggle}
          </button>
          <button className="headerActionBtn" onClick={toggleLang}>
            {text.langToggle}
          </button>
          <StatusPill status={wsStatus} lang={lang} />
        </div>
      </header>

      <div className="main">
        <div className="canvasArea">
          <ClusterView />
          <ControlPanel />
        </div>
        <aside className="rightPanel">
          <LogPanel />
          {eventLogOpen && <EventStream />}
        </aside>
      </div>
    </div>
  )
}

function StatusPill({ status, lang, compact = false }) {
  return (
    <div className={`statusPill ${compact ? 'statusPillCompact' : ''}`}>
      <div className={`statusDot ${status}`} />
      {wsStatusLabel(status, lang)}
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
