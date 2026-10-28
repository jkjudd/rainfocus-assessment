import { describeError } from '../api/events.js'

// The loading and error states of a modal that loads an event by id, driven by
// useEventById. Renders nothing once the event has loaded. statusRef is the
// hook's, so focus can follow a retry.
export default function EventLoadState({ status, error, statusRef, onRetry, onClose }) {
  if (status === 'loading') {
    return (
      <p ref={statusRef} className="modal-status" role="status" tabIndex={-1}>
        Loading event…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="modal-status">
        <p>{describeError(error)}</p>
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
          {error.status !== 404 && (
            <button
              ref={statusRef}
              type="button"
              className="button button-primary"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }
  return null
}
