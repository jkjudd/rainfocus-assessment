import { useEffect, useRef, useState } from 'react'
import { describeError, getEvent, isAbortError } from '../api/events.js'
import { useDismissToast, useToast } from '../toast/toastContext.js'

// Loads one event fresh by id (GET /events/{id}) for a modal, so it shows the
// server's current copy rather than the list's. Does nothing when eventId is
// null. A failure raises a toast; a 404 also calls onMissing(eventId) so the
// list can drop the event. Returns { status, event, error, retry, statusRef }:
// attach statusRef to the loading message and the retry button (see
// EventLoadState) so focus follows a retry.
export function useEventById(eventId, { onMissing } = {}) {
  const enabled = eventId != null
  const showToast = useToast()
  const [load, setLoad] = useState({ status: enabled ? 'loading' : 'ready', event: null })
  const [attempt, setAttempt] = useState(0)

  // A load error's toast belongs to this modal: it's cleared once a retry
  // succeeds or the modal closes. A 404's toast stays, since it also explains
  // why the event left the list.
  const dismissToast = useDismissToast()
  const errorToast = useRef(null)
  useEffect(() => () => dismissToast(errorToast.current), [dismissToast])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    getEvent(eventId, { signal: controller.signal })
      .then((event) => {
        setLoad({ status: 'ready', event })
        dismissToast(errorToast.current)
        errorToast.current = null
      })
      .catch((error) => {
        if (isAbortError(error)) return
        setLoad({ status: 'error', event: null, error })
        const toastId = showToast(`Couldn't load the event. ${describeError(error)}`)
        if (error.status === 404) onMissing?.(eventId)
        else errorToast.current = toastId
      })
    return () => controller.abort()
  }, [enabled, eventId, attempt, showToast, dismissToast, onMissing])

  // Keep focus with the retry: the loading message, then the button again if it
  // fails (on success the modal's content takes focus itself, or keeps it).
  const statusRef = useRef(null)
  const retrying = useRef(false)
  useEffect(() => {
    if (!retrying.current) return
    if (load.status !== 'ready') statusRef.current?.focus()
    if (load.status !== 'loading') retrying.current = false
  }, [load.status])

  function retry() {
    retrying.current = true
    setLoad({ status: 'loading', event: null })
    setAttempt((count) => count + 1)
  }

  return { ...load, retry, statusRef }
}
