import { useEffect, useRef } from 'react'
import { useClusterStore } from '../store/clusterStore'
import { eventCopy } from '../i18n/uiText'
import styles from './EventStream.module.css'

export default function EventStream({ fill = false }) {
  const events = useClusterStore(s => s.eventLogs)
  const lang = useClusterStore(s => s.lang)
  const text = eventCopy(lang)
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // Pinning to the tail keeps high-frequency protocol traffic readable.
    el.scrollTop = el.scrollHeight
  }, [events.length])

  return (
    <div className={`${styles.stream} ${fill ? styles.fill : ''}`}>
      <div className={styles.title}>{text.title}</div>
      {events.length === 0 ? (
        <div className={styles.empty}>{text.empty}</div>
      ) : (
        <div className={styles.list} ref={listRef}>
          {events.map(ev => (
            <div key={ev.id} className={`${styles.event} ${styles[ev.level] ?? styles.normal}`}>
              <span className={styles.time}>[{ev.time}]</span>
              <span className={styles.route}>[node{ev.from} → node{ev.to}]</span>
              <span className={styles.type}>[{ev.eventType}]</span>
              <span className={styles.term}>[t{ev.term}]</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
