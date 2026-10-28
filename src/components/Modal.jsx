import { useEffectEvent, useId, useLayoutEffect, useRef } from 'react'
import { useToastHost } from '../toast/toastContext.js'

// A native <dialog> opened with showModal(), which provides the backdrop, focus
// trapping and Escape handling. Mount it to open it; the parent unmounts it to
// close. `busy` asks the browser to keep it open while a request is in flight.
export default function Modal({ title, onClose, busy = false, children }) {
  const dialogRef = useRef(null)
  const toastSlotRef = useRef(null)
  const titleId = useId()
  const registerToastHost = useToastHost()

  const onNativeClose = useEffectEvent(() => onClose())

  // A layout effect, because its cleanup runs before React removes the <dialog>:
  // close() on a dialog that is already detached can't return focus to the
  // element that opened it.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement
    // Browsers may close a dialog without a cancelable `cancel` event (repeated
    // Escape, Android back), so the parent's state follows the native close.
    // The close event is queued, so a stale one (e.g. from StrictMode's
    // close-then-reopen) can arrive after the dialog is open again: ignore it.
    const handleNativeClose = () => {
      if (!dialog.open) onNativeClose()
    }
    dialog.addEventListener('close', handleNativeClose)
    dialog.showModal()
    const unregisterToastHost = registerToastHost(toastSlotRef.current)
    return () => {
      // Detach first: closing here is the parent's doing, not a user close.
      dialog.removeEventListener('close', handleNativeClose)
      unregisterToastHost()
      dialog.close()
      const restoreFocus = () => {
        if (document.querySelector('dialog[open]')) return
        if (opener?.isConnected) {
          if (document.activeElement !== opener) opener.focus()
        } else {
          // The opener is gone (e.g. its event was deleted): fall back to the
          // page heading rather than leaving focus on <body>.
          document.querySelector('h1')?.focus()
        }
      }
      restoreFocus()
      // A re-sort in the same commit can move the opener's card after this
      // cleanup runs, and moving a node drops its focus: check again once the
      // commit is done.
      queueMicrotask(() => {
        if (document.activeElement === document.body) restoreFocus()
      })
    }
  }, [registerToastHost])

  function handleCancel(event) {
    // Escape: keep the dialog open and let the parent decide.
    event.preventDefault()
    if (!busy) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={handleCancel}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
        >
          {/* An SVG rather than the "×" character, whose glyph sits low in its
              line box and can't be centered reliably across fonts. */}
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {children}
      {/* Toasts are portaled here, after the content. Registering the <dialog>
          itself would put them before content that mounts later (the edit form
          after its event loads), since React appends that content at the end. */}
      <div ref={toastSlotRef} className="modal-toasts" />
    </dialog>
  )
}
