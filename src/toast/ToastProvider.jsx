import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DismissToastContext, ToastContext, ToastHostContext } from './toastContext.js'

// Errors stay until dismissed: a failed save leaves its modal open, and the
// reason mustn't vanish before the user has read it (WCAG 2.2.1).
const DURATION_MS = { success: 5000, error: Infinity }

// Long enough for a portal that just moved (a modal opening or closing in the
// same update as the toast) to be in the page before its text changes; screen
// readers skip text that is already present when a live region is inserted.
const ANNOUNCE_DELAY_MS = 150

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [announcement, setAnnouncement] = useState({ polite: '', assertive: '' })
  const nextId = useRef(0)
  // id -> { timeout, remaining, startedAt }; timers pause while the pointer or
  // focus is on a toast so it can't vanish while someone is reading it.
  const timers = useRef(new Map())
  const pauseReasons = useRef(new Set()) // 'hover' and/or 'focus'
  const announceTimeout = useRef(null)
  const pendingAnnouncements = useRef({ polite: [], assertive: [] })

  const dismiss = useCallback((id) => {
    if (id == null) return
    clearTimeout(timers.current.get(id)?.timeout)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const startTimer = useCallback(
    (id, timer) => {
      timer.startedAt = Date.now()
      // setTimeout(fn, Infinity) would fire at once, so a toast that never
      // expires gets no timer at all.
      timer.timeout =
        pauseReasons.current.size > 0 || !Number.isFinite(timer.remaining)
          ? null
          : setTimeout(() => dismiss(id), timer.remaining)
    },
    [dismiss],
  )

  const showToast = useCallback(
    (message, { type = 'error' } = {}) => {
      const id = nextId.current++
      // Errors don't expire, so a repeated failure (say, retrying during an
      // outage) replaces its identical toast instead of stacking another.
      setToasts((current) => {
        const replaced = current.filter((toast) => toast.type === 'error' && toast.message === message)
        replaced.forEach((toast) => timers.current.delete(toast.id))
        return [...current.filter((toast) => !replaced.includes(toast)), { id, message, type }]
      })
      const timer = { remaining: DURATION_MS[type] ?? DURATION_MS.error }
      timers.current.set(id, timer)
      startTimer(id, timer)

      // Toasts that arrive within the delay are announced together, not just
      // the last one, and a message repeated within it is read once.
      const politeness = type === 'error' ? 'assertive' : 'polite'
      const pending = pendingAnnouncements.current[politeness]
      if (!pending.includes(message)) pending.push(message)
      clearTimeout(announceTimeout.current)
      setAnnouncement({ polite: '', assertive: '' })
      announceTimeout.current = setTimeout(() => {
        const { polite, assertive } = pendingAnnouncements.current
        pendingAnnouncements.current = { polite: [], assertive: [] }
        setAnnouncement({ polite: polite.join(' '), assertive: assertive.join(' ') })
      }, ANNOUNCE_DELAY_MS)
      return id
    },
    [startTimer],
  )

  const pause = useCallback((reason) => {
    const wasRunning = pauseReasons.current.size === 0
    pauseReasons.current.add(reason)
    if (!wasRunning) return
    for (const timer of timers.current.values()) {
      if (timer.timeout == null) continue
      clearTimeout(timer.timeout)
      timer.timeout = null
      timer.remaining -= Date.now() - timer.startedAt
    }
  }, [])

  // resume() with no reason clears every reason, for when the region is
  // remounted and the matching mouseleave/blur may never fire.
  const resume = useCallback(
    (reason) => {
      if (pauseReasons.current.size === 0) return
      if (reason) pauseReasons.current.delete(reason)
      else pauseReasons.current.clear()
      if (pauseReasons.current.size > 0) return
      timers.current.forEach((timer, id) => {
        if (timer.timeout == null) startTimer(id, timer)
      })
    },
    [startTimer],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer.timeout))
      clearTimeout(announceTimeout.current)
    }
  }, [])

  // Open modals, innermost last; toasts render into the innermost one.
  const [hosts, setHosts] = useState([])
  const registerHost = useCallback((element) => {
    setHosts((current) => [...current, element])
    return () => setHosts((current) => current.filter((host) => host !== element))
  }, [])

  // When the last toast goes, or the region moves to another host, the pointer
  // or focus may never "leave" it, so stop waiting for that.
  useEffect(() => {
    if (toasts.length === 0) resume()
  }, [toasts, resume])
  useEffect(() => {
    resume()
  }, [hosts, resume])

  // Inside a modal the region sits below the form (see App.css), which may be
  // scrolled: bring a new toast into view.
  const regionRef = useRef(null)
  useEffect(() => {
    if (hosts.length && toasts.length) regionRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [hosts, toasts])

  // On the page the region is fixed over the content, so it reserves its height:
  // --toast-clearance pads the bottom of the page and the scroll padding (see
  // index.css), and whatever has focus is kept scrolled clear of the toasts.
  useEffect(() => {
    const region = regionRef.current
    const root = document.documentElement
    if (hosts.length || !region) return
    const keepFocusClear = () => {
      const active = document.activeElement
      if (!active || active === document.body || region.contains(active)) return
      const box = region.getBoundingClientRect()
      if (!box.height) return
      const target = active.getBoundingClientRect()
      const covered =
        target.bottom > box.top && target.top < box.bottom &&
        target.right > box.left && target.left < box.right
      if (covered) active.scrollIntoView?.({ block: 'nearest' })
    }
    const update = () => {
      const height = region.getBoundingClientRect().height
      root.style.setProperty('--toast-clearance', height ? `${Math.ceil(height) + 32}px` : '0px')
      keepFocusClear()
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(region)
    // Focus that moves later (Tab, or returning from a modal) is checked too.
    // Deferred a frame so it runs after the browser's own focus scrolling.
    const onFocusIn = () => requestAnimationFrame(keepFocusClear)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      observer?.disconnect()
      document.removeEventListener('focusin', onFocusIn)
      root.style.setProperty('--toast-clearance', '0px')
    }
  }, [hosts])

  // Where focus was before it entered the toasts, to return it there once the
  // last one is dismissed.
  const focusOrigin = useRef(null)

  // The dismiss button unmounts with its toast, which would drop focus to
  // <body>: move it first, to the next toast, else back to where it came from.
  function dismissFromButton(event, id) {
    const card = event.currentTarget.closest('.toast')
    const sibling = card.nextElementSibling ?? card.previousElementSibling
    const target =
      sibling?.querySelector('.toast-close') ??
      (focusOrigin.current?.isConnected ? focusOrigin.current : null) ??
      card.closest('dialog')?.querySelector('.icon-button') ??
      document.querySelector('h1')
    target?.focus()
    dismiss(id)
  }

  // Screen readers get the text through the two visually hidden live regions;
  // the visible toasts carry no live roles so a remount can't re-announce them.
  const region = (
    <div className="toast-layer">
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement.polite}
      </div>
      <div className="visually-hidden" aria-live="assertive" aria-atomic="true">
        {announcement.assertive}
      </div>
      <section
        ref={regionRef}
        className="toast-region"
        aria-label="Notifications"
        onMouseEnter={() => pause('hover')}
        onMouseLeave={() => resume('hover')}
        onFocus={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            focusOrigin.current = event.relatedTarget
          }
          pause('focus')
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) resume('focus')
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={(event) => dismissFromButton(event, toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </section>
    </div>
  )

  return (
    <ToastContext value={showToast}>
      <DismissToastContext value={dismiss}>
        <ToastHostContext value={registerHost}>
          {children}
          {createPortal(region, hosts.at(-1) ?? document.body)}
        </ToastHostContext>
      </DismissToastContext>
    </ToastContext>
  )
}
