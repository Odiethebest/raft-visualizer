import { useClusterStore } from '../store/clusterStore'
import { eventCopy, formatEvent } from '../i18n/uiText'
import styles from './EventStream.module.css'

// EventStream shows a rolling log of cluster-level state transitions.
// Events are prepended in the store so the newest is always at the top here —
// no auto-scroll needed.

export default function EventStream() {
  const events = useClusterStore(s => s.events)
  const lang = useClusterStore(s => s.lang)
  const text = eventCopy(lang)

  return (
    <div className={styles.stream}>
      <div className={styles.title}>{text.title}</div>
      {events.length === 0 ? (
        <div className={styles.empty}>{text.empty}</div>
      ) : (
        <div className={styles.list}>
          {events.map(ev => (
            <div key={ev.id} className={`${styles.event} ${styles[ev.level] ?? styles.normal}`}>
              <span className={styles.time}>{ev.time}</span>
              <span className={styles.message}>{formatEvent(ev, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
