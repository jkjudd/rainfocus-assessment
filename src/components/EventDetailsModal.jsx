import { useEffect, useRef, useState } from 'react'
import { useEventById } from '../hooks/useEventById.js'
import { isNamedColor, normalizeColor } from '../lib/colors.js'
import { formatEventWhen, parseCreatedOn } from '../lib/events.js'
import EventLoadState from './EventLoadState.jsx'
import Modal from './Modal.jsx'

const NOT_SET = <span className="event-details-empty">Not set</span>

function statusText(isActive) {
  if (isActive === true) return 'Active'
  if (isActive === false) return 'Inactive'
  return NOT_SET
}

function createdText(createdOn) {
  if (!createdOn) return NOT_SET
  const date = parseCreatedOn(createdOn)
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : createdOn
}

// Only http(s) URLs are loaded as images.
function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// Stands in for an event image that is missing or couldn't be loaded: a picture
// icon struck through, with the reason as its caption and accessible name.
function ImagePlaceholder({ label }) {
  return (
    <div className="image-placeholder" role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-7 7" />
          <path d="M3 3l18 18" />
        </g>
      </svg>
      <span aria-hidden="true">{label}</span>
    </div>
  )
}

// The event's image, or the placeholder when there's no usable URL or the
// image fails to load.
function EventImage({ src, name }) {
  const [broken, setBroken] = useState(false)
  if (!src) return <ImagePlaceholder label="No image" />
  if (!isHttpUrl(src) || broken) return <ImagePlaceholder label="Image couldn't be loaded" />
  return (
    <img
      className="event-details-image"
      src={src}
      alt={`Image for ${name || 'this event'}`}
      onError={() => setBroken(true)}
    />
  )
}

// Read-only view of one event, loaded fresh by id. Editing happens in
// EventModal, opened from the list's Edit button.
export default function EventDetailsModal({ eventId, onMissing, onClose }) {
  const { status, event, error, retry, statusRef } = useEventById(eventId, { onMissing })

  // After a retry succeeds, the focused "Try again" button and the loading
  // message are gone; move focus to the loaded details so it isn't left on
  // <body> (the edit form focuses its first field itself).
  const detailsRef = useRef(null)
  useEffect(() => {
    if (status === 'ready' && document.activeElement === document.body) detailsRef.current?.focus()
  }, [status])

  let body
  if (status === 'ready') {
    const color = normalizeColor(event.color)
    const when = formatEventWhen(event)
    const rows = [
      ['Name', event.name || 'Untitled event'],
      ['Company', event.company || 'No company'],
      ['Status', statusText(event.isActive)],
      ['Date and time', when || NOT_SET],
      [
        'Color',
        <span className="event-details-color">
          <span
            className="swatch"
            style={isNamedColor(color) ? { background: color } : undefined}
            aria-hidden="true"
          />
          {color || 'None'}
        </span>,
      ],
      ['Email', event.email ? <a href={`mailto:${event.email}`}>{event.email}</a> : NOT_SET],
      ['Phone', event.phone ? <a href={`tel:${event.phone.replace(/[^\d+]/g, '')}`}>{event.phone}</a> : NOT_SET],
      ['Address', event.address || NOT_SET],
      ['Description', event.description || 'No description'],
      ['Image', <EventImage src={event.image} name={event.name} />],
      ['Created', createdText(event.createdOn)],
    ]
    body = (
      <>
        <dl ref={detailsRef} className="event-details" tabIndex={-1}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <EventLoadState
        status={status}
        error={error}
        statusRef={statusRef}
        onRetry={retry}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal title="Event details" onClose={onClose}>
      {body}
    </Modal>
  )
}
