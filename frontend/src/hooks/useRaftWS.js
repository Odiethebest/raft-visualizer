import { useEffect, useRef } from 'react'
import { useClusterStore } from '../store/clusterStore'

const WS_URL = 'ws://localhost:8080/ws'
// How long to wait before trying to reconnect after a drop. Keep this short
// enough that the user sees recovery happen visibly, but not so short that
// we spam the server during a prolonged outage.
const RECONNECT_DELAY_MS = 2000

export function useRaftWS() {
  const applyStateUpdate = useClusterStore(s => s.applyStateUpdate)
  const setWsStatus      = useClusterStore(s => s.setWsStatus)
  const setSendFault     = useClusterStore(s => s.setSendFault)

  // wsRef holds the live WebSocket instance so the sendFault closure can
  // always reach it without stale-closure issues.
  const wsRef    = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    function connect() {
      setWsStatus('connecting')

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
      }

      ws.onmessage = (e) => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }

        if (msg.type === 'STATE_UPDATE') {
          applyStateUpdate(msg.payload)
        }
      }

      ws.onclose = () => {
        setWsStatus('reconnecting')
        timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      ws.onerror = () => {
        // onclose fires immediately after onerror; let that handle reconnect.
        ws.close()
      }
    }

    // sendFault is the only command the frontend sends to the server.
    // We wrap it here so callers never touch the WebSocket directly.
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

    setSendFault(sendFault)
    connect()

    return () => {
      clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
