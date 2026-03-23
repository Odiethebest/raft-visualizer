import { useEffect, useRef } from 'react'
import { useClusterStore } from '../store/clusterStore'

// How long to wait before trying to reconnect after a drop. Keep this short
// enough that the user sees recovery happen visibly, but not so short that
// we spam the server during a prolonged outage.
const RECONNECT_DELAY_MS = 2000

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

export function useRaftWS() {
  const applyStateUpdate = useClusterStore(s => s.applyStateUpdate)
  const setWsStatus      = useClusterStore(s => s.setWsStatus)
  const setSendFault     = useClusterStore(s => s.setSendFault)
  const setSendClientCommand = useClusterStore(s => s.setSendClientCommand)

  // wsRef holds the live WebSocket instance so the sendFault closure can
  // always reach it without stale-closure issues.
  const wsRef    = useRef(null)
  const timerRef = useRef(null)
  const disposedRef = useRef(false)

  useEffect(() => {
    disposedRef.current = false

    function connect() {
      if (disposedRef.current) return
      setWsStatus('connecting')

      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        if (disposedRef.current || wsRef.current !== ws) return
        setWsStatus('connected')
      }

      ws.onmessage = (e) => {
        if (disposedRef.current || wsRef.current !== ws) return
        let msg
        try { msg = JSON.parse(e.data) } catch { return }

        if (msg.type === 'STATE_UPDATE') {
          applyStateUpdate(msg.payload)
        }
      }

      ws.onclose = () => {
        if (disposedRef.current || wsRef.current !== ws) return
        setWsStatus('reconnecting')
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      ws.onerror = () => {
        if (disposedRef.current || wsRef.current !== ws) return
        // onclose fires immediately after onerror; let that handle reconnect.
        ws.close()
      }
    }

    // Wrapping outbound messages here keeps UI components decoupled from the
    // socket lifecycle and readyState details.
    function sendFault(action, targets, partitionGroups, command) {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({
        type: 'FAULT_INJECT',
        payload: {
          action,
          targets:         targets         ?? [],
          partitionGroups: partitionGroups ?? [],
          command:         command         ?? '',
        },
      }))
    }

    // Mobile command input writes directly through a dedicated message type so
    // command submission remains available even when the desktop control bar is hidden.
    function sendClientCommand(command) {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return
      wsRef.current.send(JSON.stringify({
        type: 'CLIENT_COMMAND',
        payload: { command: command ?? '' },
      }))
    }

    setSendFault(sendFault)
    setSendClientCommand(sendClientCommand)
    connect()

    return () => {
      disposedRef.current = true
      clearTimeout(timerRef.current)
      timerRef.current = null
      setSendFault(null)
      setSendClientCommand(null)

      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        // Prevent cleanup-triggered close from scheduling reconnect.
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
