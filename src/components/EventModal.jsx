import { useState } from 'react'
import { useEventById } from '../hooks/useEventById.js'
import { EMPTY_EVENT_FIELDS, pickEventFields } from '../lib/events.js'
import EventForm from './EventForm.jsx'
import EventLoadState from './EventLoadState.jsx'
import Modal from './Modal.jsx'

// Create mode when eventId is undefined. In edit mode the event is loaded fresh
// by id so the form starts from the server's current copy, not the list's.
// onSave(fields, existingEvent) performs the request and resolves when done.
export default function EventModal({ eventId, onSave, onMissing, onClose }) {
  const isEdit = eventId != null
  const { status, event, error, retry, statusRef } = useEventById(eventId, { onMissing })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(fields) {
    setSaving(true)
    try {
      await onSave(fields, event)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit event' : 'New event'} onClose={onClose} busy={saving}>
      {status === 'ready' ? (
        <EventForm
          initialFields={isEdit ? pickEventFields(event) : EMPTY_EVENT_FIELDS}
          submitLabel={isEdit ? 'Save changes' : 'Create event'}
          savingLabel={isEdit ? 'Saving…' : 'Creating…'}
          saving={saving}
          requireChanges={isEdit}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      ) : (
        <EventLoadState
          status={status}
          error={error}
          statusRef={statusRef}
          onRetry={retry}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}
