import { useClusterStore } from './store/clusterStore'
import { useRaftWS } from './hooks/useRaftWS'
import ClusterView from './components/ClusterView'
import LogPanel from './components/LogPanel'
import EventStream from './components/EventStream'
import ControlPanel from './components/ControlPanel'
import './App.css'

export default function App() {
  // useRaftWS owns the WebSocket lifecycle. Mounting it here (top of the
  // tree) means it connects once and stays connected for the app's lifetime.
  useRaftWS()

  const nodes    = useClusterStore(s => s.nodes)
  const wsStatus = useClusterStore(s => s.wsStatus)

  const leader = nodes.find(n => n.role === 'leader' && n.alive)
  const alive  = nodes.filter(n => n.alive).length

  return (
    <div className="app">
      <header className="header">
        <div className="headerLeft">
          <span className="headerTitle">Raft Consensus</span>
          <span className="headerSub">By Odie Yang</span>
        </div>
        <div className="headerRight">
          {leader && (
            <div className="headerStat">
              <span className="headerStatLabel">leader</span>
              <span className="headerStatValue">node {leader.id}</span>
            </div>
          )}
          <div className="headerStat">
            <span className="headerStatLabel">term</span>
            <span className="headerStatValue">{leader?.term ?? '—'}</span>
          </div>
          <div className="headerStat">
            <span className="headerStatLabel">alive</span>
            <span className="headerStatValue">{alive} / {nodes.length}</span>
          </div>
          <StatusPill status={wsStatus} />
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

function StatusPill({ status }) {
  const labels = {
    connected:    'connected',
    connecting:   'connecting',
    reconnecting: 'reconnecting',
  }
  return (
    <div className="statusPill">
      <div className={`statusDot ${status}`} />
      {labels[status] ?? status}
    </div>
  )
}
