import { useClusterStore } from '../store/clusterStore'
import styles from './EventStream.module.css'

// EventStream shows a rolling log of cluster-level state transitions.
// Events are prepended in the store so the newest is always at the top here —
// no auto-scroll needed.

export default function EventStream() {
  const events = useClusterStore(s => s.events)

  return (
    <div className={styles.stream}>
      <div className={styles.title}>events</div>
      {events.length === 0 ? (
        <div className={styles.empty}>waiting for cluster activity…</div>
      ) : (
        <div className={styles.list}>
          {events.map((ev, i) => (
            <div key={i} className={`${styles.event} ${styles[ev.level] ?? styles.normal}`}>
              <span className={styles.time}>{ev.time}</span>
              <span className={styles.message}>{ev.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
