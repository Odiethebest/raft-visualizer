import { useEffect, useMemo, useRef, useState } from 'react'
import { useClusterStore } from '../store/clusterStore'
import { controlCopy } from '../i18n/uiText'
import LogPanel from './LogPanel'
import EventStream from './EventStream'
import styles from './MobileDrawer.module.css'

const COLLAPSED_PX = 40

function modeHeightPx(mode, viewportHeight) {
  if (mode === 'half') return Math.round(viewportHeight * 0.5)
  if (mode === 'full') return Math.round(viewportHeight * 0.85)
  return COLLAPSED_PX
}

function nearestMode(height, viewportHeight) {
  const targets = [
    { mode: 'collapsed', h: modeHeightPx('collapsed', viewportHeight) },
    { mode: 'half', h: modeHeightPx('half', viewportHeight) },
    { mode: 'full', h: modeHeightPx('full', viewportHeight) },
  ]
  let best = targets[0]
  for (const t of targets) {
    if (Math.abs(height - t.h) < Math.abs(height - best.h)) best = t
  }
  return best.mode
}

export default function MobileDrawer({
  mode,
  onModeChange,
  tab,
  onTabChange,
  leader,
  aliveCount,
  totalCount,
  onSubmitCommand,
}) {
  const lang = useClusterStore(s => s.lang)
  const text = controlCopy(lang)
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [dragHeight, setDragHeight] = useState(null)
  const touchRef = useRef({
    active: false,
    startY: 0,
    startHeight: COLLAPSED_PX,
    moved: false,
  })
  const suppressClickRef = useRef(false)

  useEffect(() => {
    function onResize() {
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const baseHeight = useMemo(
    () => modeHeightPx(mode, viewportHeight),
    [mode, viewportHeight]
  )
  const currentHeight = dragHeight ?? baseHeight
  const isDragging = dragHeight !== null
  const leaderId = leader?.id ?? '—'
  const leaderTerm = leader?.term ?? '—'

  function onHandlePointerDown(e) {
    e.preventDefault()
    onHandleClick()
  }

  function handleFastTap(action) {
    return (e) => {
      e.preventDefault()
      action()
    }
  }

  function onHandleClick() {
    if (suppressClickRef.current) return
    // Tap on handle should behave as a direct fold/unfold control.
    // Users can still reach full height by dragging, but a tap from open state
    // must collapse immediately instead of stepping to a taller mode.
    onModeChange(mode === 'collapsed' ? 'half' : 'collapsed')
  }

  function onTouchStart(e) {
    const y = e.touches?.[0]?.clientY
    if (typeof y !== 'number') return
    const rect = e.currentTarget.getBoundingClientRect()
    // Restrict drag capture close to the handle so tab/content taps are not
    // misclassified as drag starts.
    const inDragZone = y <= rect.top + 44
    if (!inDragZone) {
      touchRef.current.active = false
      return
    }

    touchRef.current = {
      active: true,
      startY: y,
      startHeight: currentHeight,
      moved: false,
    }
  }

  function onTouchMove(e) {
    if (!touchRef.current.active) return
    const y = e.touches?.[0]?.clientY
    if (typeof y !== 'number') return
    const delta = touchRef.current.startY - y
    if (Math.abs(delta) > 10) touchRef.current.moved = true

    // We clamp to known drawer stops so drag remains predictable
    // regardless of device height and orientation.
    const minH = COLLAPSED_PX
    const maxH = modeHeightPx('full', viewportHeight)
    const next = Math.max(minH, Math.min(maxH, touchRef.current.startHeight + delta))
    setDragHeight(next)
    e.preventDefault()
  }

  function finishTouch() {
    if (!touchRef.current.active) return
    touchRef.current.active = false
    if (dragHeight === null) return
    if (touchRef.current.moved) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 90)
    }
    const next = nearestMode(dragHeight, viewportHeight)
    setDragHeight(null)
    onModeChange(next)
  }

  return (
    <div
      className={`${styles.drawer} ${isDragging ? styles.dragging : ''}`}
      style={{ height: `${currentHeight}px` }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={finishTouch}
      onTouchCancel={finishTouch}
    >
      <button
        type="button"
        className={styles.handle}
        onPointerDown={onHandlePointerDown}
      >
        <span className={styles.handleText}>
          {`LEADER node${leaderId} · TERM ${leaderTerm} · ALIVE ${aliveCount}/${totalCount}`}
        </span>
        <span
          className={`${styles.handleArrow} ${mode === 'collapsed' ? styles.arrowUp : styles.arrowDown}`}
          aria-hidden="true"
        />
      </button>

      {mode !== 'collapsed' && (
        <div className={styles.content}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tabBtn} ${tab === 'node' ? styles.tabBtnActive : ''}`}
              onPointerDown={handleFastTap(() => onTabChange('node'))}
            >
              NODE
            </button>
            <button
              className={`${styles.tabBtn} ${tab === 'event' ? styles.tabBtnActive : ''}`}
              onPointerDown={handleFastTap(() => onTabChange('event'))}
            >
              EVENT LOG
            </button>
            <button
              className={`${styles.tabBtn} ${tab === 'tutorial' ? styles.tabBtnActive : ''}`}
              onPointerDown={handleFastTap(() => onTabChange('tutorial'))}
            >
              {lang === 'zh' ? '教程' : 'TUTORIAL'}
            </button>
          </div>

          <div className={styles.tabBody}>
            {tab === 'event' ? (
              <EventStream fill />
            ) : tab === 'tutorial' ? (
              <MobileTutorial text={text} />
            ) : (
              <LogPanel
                commandInput={{
                  placeholder: 'type a command...',
                  sendLabel: 'send',
                  onSubmit: onSubmitCommand,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MobileTutorial({ text }) {
  return (
    <div className={styles.tutorialView}>
      <div className={styles.tutorialTitle}>{text.tutorialTitle}</div>
      <p className={styles.tutorialIntro}>{text.tutorialIntro}</p>

      <div className={styles.tutorialSection}>
        <div className={styles.tutorialSectionTitle}>{text.tutorialCmds}</div>
        <div className={styles.tutorialList}>
          {text.tutorialCmdExamples.map((item, idx) => (
            <div key={`${item.cmd}-${idx}`} className={styles.tutorialItem}>
              <code className={styles.tutorialCmd}>{item.cmd}</code>
              <span className={styles.tutorialDetail}>{item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tutorialSection}>
        <div className={styles.tutorialSectionTitle}>{text.tutorialHow}</div>
        <div className={styles.tutorialList}>
          {text.tutorialHowItems.map((line, idx) => (
            <div key={`${line}-${idx}`} className={styles.tutorialItem}>
              <span className={styles.tutorialStepNo}>{idx + 1}.</span>
              <span className={styles.tutorialDetail}>{line}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tutorialSection}>
        <div className={styles.tutorialSectionTitle}>{text.tutorialRaft}</div>
        <div className={styles.tutorialList}>
          {text.tutorialRaftItems.map((line, idx) => (
            <div key={`${line}-${idx}`} className={styles.tutorialItem}>
              <span className={styles.tutorialDetail}>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
