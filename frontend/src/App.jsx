import { useState } from 'react'
import { useClusterStore } from './store/clusterStore'
import { useRaftWS } from './hooks/useRaftWS'
import ClusterView from './components/ClusterView'
import LogPanel from './components/LogPanel'
import EventStream from './components/EventStream'
import ControlPanel from './components/ControlPanel'
import IntroLanding from './components/IntroLanding'
import { HINT_REOPEN_EVENT } from './components/HintCard'
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

  return <LiveDemoApp />
}

function LiveDemoApp() {
  // useRaftWS owns the WebSocket lifecycle. It only mounts after the user
  // clicks "Start Demo", and unmounts when the page closes.
  useRaftWS()

  const nodes    = useClusterStore(s => s.nodes)
  const wsStatus = useClusterStore(s => s.wsStatus)
  const lang     = useClusterStore(s => s.lang)
  const toggleLang = useClusterStore(s => s.toggleLang)

  const leader = nodes.find(n => n.role === 'leader' && n.alive)
  const alive  = nodes.filter(n => n.alive).length
  const text = appCopy(lang)

  function reopenHint() {
    window.dispatchEvent(new Event(HINT_REOPEN_EVENT))
  }

  return (
    <div className="app">
      <header className="header">
        <div className="headerLeft">
          <span className="headerTitle">{text.title}</span>
          <span className="headerSub">{text.sub}</span>
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
          <button className="headerActionBtn" onClick={reopenHint}>
            {text.guide}
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
          <EventStream />
        </aside>
      </div>
    </div>
  )
}

function StatusPill({ status, lang }) {
  return (
    <div className="statusPill">
      <div className={`statusDot ${status}`} />
      {wsStatusLabel(status, lang)}
    </div>
  )
}
