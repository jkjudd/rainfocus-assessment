// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import * as api from './api/events.js'
import ToastProvider from './toast/ToastProvider.jsx'

vi.mock('./api/events.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getEvents: vi.fn(),
    getEvent: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  }
})

// The rest of the API's example payload, shared by the fixture events.
const PAYLOAD_EXTRAS = {
  isActive: true,
  date: '2021-01-05',
  time: '06:56',
  email: 'team@example.com',
  phone: '+1 (831) 446-3332',
  address: '697 Brooklyn Road, Northridge',
  image: 'https://example.com/event.png',
  createdOn: '2020-09-05T03:56:56 +06:00',
}

const EVENTS = [
  { id: 1, name: 'Event 1', description: 'First', company: 'GEEKFARM', color: 'red', ...PAYLOAD_EXTRAS },
  { id: 2, name: 'Event 2', description: 'Second', company: 'ZILCH', color: 'green', ...PAYLOAD_EXTRAS },
  { id: 3, name: 'Event 3', description: 'Third', company: 'anocha', color: 'blue', ...PAYLOAD_EXTRAS },
]

beforeAll(() => {
  // jsdom has no modal dialog support. Like browsers, fire `close` as a
  // separate task rather than synchronously.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    if (!this.open) return
    this.open = false
    setTimeout(() => this.dispatchEvent(new Event('close')))
  }
})

// Like fetch: settle on a later tick, or reject with an AbortError if the
// caller aborts first (as StrictMode's mount/unmount/mount does).
function respond(result, signal) {
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    queueMicrotask(() => (result instanceof Error ? reject(result) : resolve(result)))
  })
}

// Every call to getEvents settles with `result` (an Error rejects); a function
// is called per request instead, for results that settle later.
function mockGetEvents(result) {
  vi.mocked(api.getEvents).mockImplementation(({ signal } = {}) => {
    if (typeof result === 'function') return result(signal)
    return respond(result === EVENTS ? EVENTS.map((event) => ({ ...event })) : result, signal)
  })
}

// Every call to getEvent settles with `result` (an Error rejects), unless the
// modal aborts it first, as fetch would.
function mockGetEvent(result) {
  vi.mocked(api.getEvent).mockImplementation((_id, { signal } = {}) => respond(result, signal))
}

beforeEach(() => {
  mockGetEvents(EVENTS)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

// The showModal stub queues `close` with setTimeout(0); let queued ones fire.
const flushQueuedCloseEvents = () => act(() => new Promise((resolve) => setTimeout(resolve)))

function renderApp(userOptions) {
  // No pause between keystrokes: the form has ten fields to type into.
  const user = userEvent.setup({ delay: null, ...userOptions })
  // StrictMode as in main.jsx: its mount/unmount/mount cycle has caught bugs.
  render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  )
  return user
}

function listedNames() {
  return within(screen.getByRole('list'))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

function toastRegion() {
  return screen.getByRole('region', { name: 'Notifications' })
}

// Valid values for the fields most tests don't care about.
const FORM_DEFAULTS = {
  date: '2021-01-05',
  time: '06:56',
  email: 'team@acme.com',
  phone: '555-0100',
  address: '1 Main St',
  image: 'https://example.com/a.png',
}

async function fillForm(user, dialog, values) {
  const { name, description, company, color, date, time, email, phone, address, image } = {
    ...FORM_DEFAULTS,
    ...values,
  }
  const fields = {
    'Event name': name,
    Description: description,
    'Company name': company,
    Color: color,
    Date: date,
    Time: time,
    Email: email,
    Phone: phone,
    Address: address,
    'Image URL': image,
  }
  for (const [label, value] of Object.entries(fields)) {
    const input = within(dialog).getByLabelText(label)
    await user.clear(input)
    if (value) await user.type(input, value)
  }
}

describe('event list', () => {
  it('shows name, description and company, sorted by company ignoring case', async () => {
    renderApp()
    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 1', 'Event 2']))
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('GEEKFARM')).toBeTruthy()
  })

  it('shows a toast and a retry button when loading fails', async () => {
    mockGetEvents(new api.ApiError('Server down.'))
    const user = renderApp()
    await waitFor(() => expect(within(toastRegion()).getByText(/Server down\./)).toBeTruthy())
    expect(screen.queryByRole('list')).toBeNull()

    mockGetEvents(EVENTS)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(listedNames()).toHaveLength(3))
  })

  it('does not report the StrictMode-aborted first load as a failure', async () => {
    renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    expect(api.getEvents).toHaveBeenCalledTimes(2) // premise: the first request really was aborted
    expect(within(toastRegion()).queryByText(/Couldn't load/)).toBeNull()
  })

  it('labels events with missing fields instead of rendering blanks', async () => {
    mockGetEvents([{ id: 7, name: '', description: '', company: '', color: '' }])
    renderApp()
    expect(await screen.findByRole('button', { name: 'Untitled event' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Untitled event' })).toBeTruthy()
    expect(screen.getByText('No company')).toBeTruthy()
  })

  it('shows each event\'s date and time, and marks inactive events', async () => {
    mockGetEvents([
      { ...EVENTS[0], isActive: false },
      { ...EVENTS[1], date: '', time: '' },
    ])
    renderApp()
    await waitFor(() => expect(listedNames()).toEqual(['Event 1', 'Event 2']))
    const [first, second] = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(within(first).getByText('Inactive')).toBeTruthy()
    expect(within(first).getByText(/2021/)).toBeTruthy()
    expect(within(second).queryByText('Inactive')).toBeNull()
    expect(within(second).queryByText(/2021/)).toBeNull()
  })

  it('shows an empty state when there are no events', async () => {
    mockGetEvents([])
    renderApp()
    expect(await screen.findByText('No events yet. Add one to get started.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('toasts', () => {
  it('clears a save error toast once its modal is closed', async () => {
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockRejectedValue(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await user.type(await within(dialog).findByLabelText('Event name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await within(toastRegion()).findByText(/Couldn't update the event/)

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(toastRegion()).queryByText(/Couldn't update the event/)).toBeNull()
  })

  it('clears a details load error toast when the modal closes, but keeps a 404 toast', async () => {
    mockGetEvent(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    let dialog = screen.getByRole('dialog', { name: 'Event details' })
    await within(toastRegion()).findByText(/Couldn't load the event/)
    await user.click(within(dialog).getByText('Close', { selector: 'button' }))
    expect(within(toastRegion()).queryByText(/Couldn't load the event/)).toBeNull()

    mockGetEvent(new api.ApiError('That event no longer exists.', { status: 404 }))
    await user.click(screen.getByRole('button', { name: 'Event 2' }))
    dialog = screen.getByRole('dialog', { name: 'Event details' })
    await within(toastRegion()).findByText(/no longer exists/)
    await user.click(within(dialog).getByText('Close', { selector: 'button' }))
    // It explains why Event 2 left the list, so it stays.
    expect(within(toastRegion()).getByText(/no longer exists/)).toBeTruthy()
    expect(listedNames()).toEqual(['Event 3', 'Event 1'])
  })

  it('clears the list load error toast once a retry succeeds', async () => {
    mockGetEvents(new api.ApiError('Server down.'))
    const user = renderApp()
    await within(toastRegion()).findByText(/Server down\./)
    mockGetEvents(EVENTS)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    expect(within(toastRegion()).queryByText(/Server down\./)).toBeNull()
  })

  it('keeps an error toast until it is dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetEvents(new api.ApiError('Server down.'))
    const user = renderApp({ advanceTimers: vi.advanceTimersByTime })
    await within(toastRegion()).findByText(/Server down\./)
    const toast = () => within(toastRegion()).queryAllByText(/Server down\./)

    act(() => vi.advanceTimersByTime(10 * 60 * 1000))
    expect(toast()).toHaveLength(1)

    await user.click(within(toastRegion()).getByRole('button', { name: 'Dismiss notification' }))
    expect(toast()).toHaveLength(0)
  })

  it('dismisses a success toast after 5 seconds, but not while the pointer is over it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockImplementation(async (event) => event)
    const user = renderApp({ advanceTimers: vi.advanceTimersByTime })
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await user.type(await within(dialog).findByLabelText('Event name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    const updated = () => within(toastRegion()).queryByText('Updated “Event 1!”.')
    await waitFor(() => expect(updated()).toBeTruthy())

    await user.hover(toastRegion())
    act(() => vi.advanceTimersByTime(20000))
    expect(updated()).toBeTruthy()

    await user.unhover(toastRegion())
    act(() => vi.advanceTimersByTime(4900))
    expect(updated()).toBeTruthy()
    act(() => vi.advanceTimersByTime(200))
    expect(updated()).toBeNull()
  })
})

describe('modals', () => {
  it('stay open after mounting, and a native close resets state so they reopen', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    await flushQueuedCloseEvents()
    const dialog = screen.getByRole('dialog', { name: 'New event' })

    dialog.close() // what a forced Escape or Android back does
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(screen.getByRole('button', { name: 'New' }))
    await flushQueuedCloseEvents()
    expect(screen.getByRole('dialog', { name: 'New event' }).open).toBe(true)
  })

  it('ignores Escape while the delete is in flight, and honours it afterwards', async () => {
    let rejectDelete
    vi.mocked(api.deleteEvent).mockReturnValue(new Promise((_, reject) => (rejectDelete = reject)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Delete Event 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete event' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    // jsdom never turns Escape into a cancel event, so fire it as the browser would.
    const pressEscape = () => fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(pressEscape()).toBe(false) // default prevented, so the browser keeps it open
    expect(screen.getByRole('dialog', { name: 'Delete event' })).toBe(dialog)

    rejectDelete(new api.ApiError('Server error.', { status: 500 }))
    await within(toastRegion()).findByText(/Couldn't delete/)
    pressEscape()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('focus management', () => {
  it('starts on the first field and returns focus to the opener on close', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const add = screen.getByRole('button', { name: 'New' })
    await user.click(add)
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Event name')))

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(add)
  })

  it('opens the create form without errors, even under StrictMode remounts', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('Event name')))
    expect(within(dialog).queryByText(/is required/)).toBeNull()
    expect(dialog.querySelector('[aria-invalid="true"]')).toBeNull()
  })

  it('moves focus to the heading when a save finds the event already deleted', async () => {
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockRejectedValue(new api.ApiError('Gone.', { status: 404 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    const name = await within(dialog).findByLabelText('Event name')
    await user.type(name, '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 2']))
    expect(within(toastRegion()).getByText(/Couldn't update the event/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('starts the delete confirmation on Cancel and returns to the Delete button', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const trigger = screen.getByRole('button', { name: 'Delete Event 2' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Delete event' })
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' })),
    )

    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps focus through a list retry', async () => {
    let resolveRetry
    mockGetEvents(new api.ApiError('Server down.'))
    const user = renderApp()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    mockGetEvents(() => new Promise((resolve) => (resolveRetry = resolve)))
    await user.click(retry)

    await waitFor(() => expect(document.activeElement.textContent).toBe('Loading events…'))
    resolveRetry(EVENTS.map((event) => ({ ...event })))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })))
  })
})

describe('creating an event', () => {
  it('keeps submit disabled until every field is valid', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    const submit = within(dialog).getByRole('button', { name: 'Create event' })

    expect(submit.disabled).toBe(true)
    await fillForm(user, dialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'reddish' })
    expect(submit.disabled).toBe(true)
    expect(within(dialog).getByText(/web color name/)).toBeTruthy()

    await fillForm(user, dialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'Teal' })
    expect(submit.disabled).toBe(false)

    await fillForm(user, dialog, { name: '   ', description: 'Kickoff', company: 'Acme', color: 'teal' })
    expect(submit.disabled).toBe(true)
  })

  it('adds the event only after the server confirms it', async () => {
    vi.mocked(api.createEvent).mockResolvedValue({
      id: 9, name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal',
    })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await fillForm(user, dialog, { name: ' Launch ', description: 'Kickoff', company: 'Acme', color: 'Teal' })
    await user.click(within(dialog).getByRole('button', { name: 'Create event' }))

    // Every property of the API's example payload except the server's id.
    expect(api.createEvent).toHaveBeenCalledWith({
      name: 'Launch',
      description: 'Kickoff',
      company: 'Acme',
      color: 'teal',
      isActive: true,
      ...FORM_DEFAULTS,
      createdOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/),
    })
    expect(api.createEvent.mock.calls[0][0]).not.toHaveProperty('id')
    await waitFor(() => expect(listedNames()).toEqual(['Launch', 'Event 3', 'Event 1', 'Event 2']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a toast, keeps the form and adds nothing when the server fails', async () => {
    vi.mocked(api.createEvent).mockRejectedValue(new api.ApiError('Could not reach the server.'))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await fillForm(user, dialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' })
    await user.click(within(dialog).getByRole('button', { name: 'Create event' }))

    await waitFor(() =>
      expect(within(toastRegion()).getByText(/Couldn't create the event\. Could not reach/)).toBeTruthy(),
    )
    expect(listedNames()).toHaveLength(3)
    expect(within(dialog).getByLabelText('Event name').value).toBe('Launch')
    // The toast renders inside the open dialog so the modal doesn't make it
    // inert, after the form so it can't cover the form's buttons.
    expect(dialog.contains(toastRegion())).toBe(true)
    const form = dialog.querySelector('form')
    expect(form.compareDocumentPosition(toastRegion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps focus in the field when Enter submits and the request fails', async () => {
    let rejectCreate
    vi.mocked(api.createEvent).mockReturnValue(new Promise((_, reject) => (rejectCreate = reject)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await fillForm(user, dialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' })
    await user.keyboard('{Enter}')

    // While saving: jsdom keeps focus on disabled elements, unlike browsers, so
    // check that the focused field was made read-only rather than disabled.
    // fillForm types into Image URL last, so Enter is pressed there.
    const field = within(dialog).getByLabelText('Image URL')
    expect(within(dialog).getByRole('button', { name: 'Creating…' })).toBeTruthy()
    expect(field.closest('fieldset').disabled).toBe(false)
    expect(field.readOnly).toBe(true)

    rejectCreate(new api.ApiError('Server error.'))
    await waitFor(() => expect(within(toastRegion()).getByText(/Couldn't create/)).toBeTruthy())
    expect(document.activeElement).toBe(field)
    expect(field.readOnly).toBe(false)
  })

  it('sends one request when Enter is pressed again while saving', async () => {
    let resolveCreate
    vi.mocked(api.createEvent).mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await fillForm(user, dialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' })

    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')
    await user.click(within(dialog).getByRole('button', { name: 'Creating…' }))
    expect(api.createEvent).toHaveBeenCalledTimes(1)

    resolveCreate({ id: 9, name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' })
    await waitFor(() => expect(listedNames()).toEqual(['Launch', 'Event 3', 'Event 1', 'Event 2']))
  })

  it('shows a required-field error once an empty field is left', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    const name = within(dialog).getByLabelText('Event name')
    await waitFor(() => expect(document.activeElement).toBe(name))
    expect(within(dialog).queryByText('Event name is required.')).toBeNull()

    await user.tab()
    expect(within(dialog).getByText('Event name is required.')).toBeTruthy()
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(within(dialog).queryByText('Description is required.')).toBeNull() // not visited yet
  })

  it('keeps the next modal open when an earlier, force-closed create finishes', async () => {
    let resolveCreate
    vi.mocked(api.createEvent).mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const createDialog = screen.getByRole('dialog', { name: 'New event' })
    await fillForm(user, createDialog, { name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' })
    await user.click(within(createDialog).getByRole('button', { name: 'Create event' }))

    createDialog.close() // a forced close (repeated Escape, Android back) ignores busy
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Delete Event 2' }))
    const deleteDialog = screen.getByRole('dialog', { name: 'Delete event' })

    await act(async () =>
      resolveCreate({ id: 9, name: 'Launch', description: 'Kickoff', company: 'Acme', color: 'teal' }),
    )
    expect(listedNames()).toEqual(['Launch', 'Event 3', 'Event 1', 'Event 2'])
    expect(screen.getByRole('dialog', { name: 'Delete event' })).toBe(deleteDialog)
  })

  it('previews the image URL only after the field is left', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    await user.type(within(dialog).getByLabelText('Image URL'), 'https://example.com/a.png')
    // No request for each partial URL while typing.
    expect(dialog.querySelector('.image-preview')).toBeNull()

    await user.tab()
    expect(dialog.querySelector('.image-preview').getAttribute('src')).toBe('https://example.com/a.png')
  })

  it('marks an invalid field and links it to its error message', async () => {
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New event' })
    const color = within(dialog).getByLabelText('Color')
    await user.type(color, 'reddish')

    expect(color.getAttribute('aria-invalid')).toBe('true')
    const describedBy = color.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy).textContent).toMatch(/standard web color name/)

    await user.clear(color)
    await user.type(color, 'red')
    expect(color.hasAttribute('aria-invalid')).toBe(false)
  })
})

describe('viewing an event', () => {
  it('opens a read-only modal, loaded by id, when the event is selected', async () => {
    mockGetEvent({ ...EVENTS[0], description: 'Fresh from the server' })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const opener = screen.getByRole('button', { name: 'Event 1' })
    await user.click(opener)

    expect(api.getEvent).toHaveBeenCalledWith(1, expect.anything())
    const dialog = screen.getByRole('dialog', { name: 'Event details' })
    // The server's copy is shown, not the list's.
    expect(await within(dialog).findByText('Fresh from the server')).toBeTruthy()
    expect(within(dialog).getByText('GEEKFARM')).toBeTruthy()
    expect(within(dialog).getByText('red')).toBeTruthy()
    expect(within(dialog).getByText('Event 1')).toBeTruthy()
    // Nothing in it can be edited.
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0)
    expect(dialog.querySelector('input, textarea, select, form')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /save/i })).toBeNull()

    await user.click(within(dialog).getByText('Close', { selector: 'button' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('shows every property of the payload in the details', async () => {
    mockGetEvent({ ...EVENTS[0], isActive: false })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Event details' })
    await within(dialog).findByText('GEEKFARM')

    const value = (label) => within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling
    expect(value('Status').textContent).toBe('Inactive')
    expect(value('Date and time').textContent).toMatch(/2021/)
    expect(within(value('Email')).getByRole('link', { name: 'team@example.com' }).getAttribute('href')).toBe(
      'mailto:team@example.com',
    )
    expect(within(value('Phone')).getByRole('link', { name: '+1 (831) 446-3332' }).getAttribute('href')).toBe(
      'tel:+18314463332',
    )
    expect(value('Address').textContent).toBe('697 Brooklyn Road, Northridge')
    expect(within(value('Image')).getByRole('img', { name: 'Image for Event 1' }).getAttribute('src')).toBe(
      'https://example.com/event.png',
    )
    // The image itself, not its URL.
    expect(value('Image').textContent).not.toMatch(/example\.com/)
    expect(within(value('Image')).queryByRole('link')).toBeNull()
    expect(value('Created').textContent).toMatch(/2020/)
  })

  it('shows a placeholder instead of an image that fails to load or is not a web URL', async () => {
    mockGetEvent({ ...EVENTS[0] })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    let dialog = screen.getByRole('dialog', { name: 'Event details' })
    const image = await within(dialog).findByRole('img', { name: 'Image for Event 1' })

    fireEvent.error(image)
    const imageRow = within(dialog).getByText('Image', { selector: 'dt' }).nextElementSibling
    expect(within(imageRow).queryByRole('img', { name: 'Image for Event 1' })).toBeNull()
    expect(within(imageRow).getByRole('img', { name: "Image couldn't be loaded" })).toBeTruthy()
    expect(imageRow.textContent).not.toMatch(/example\.com/)

    await user.click(within(dialog).getByText('Close', { selector: 'button' }))
    mockGetEvent({ ...EVENTS[0], image: 'javascript:alert(1)' })
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    dialog = screen.getByRole('dialog', { name: 'Event details' })
    expect(await within(dialog).findByRole('img', { name: "Image couldn't be loaded" })).toBeTruthy()
    expect(dialog.querySelector('img')).toBeNull() // the URL was never loaded
  })

  it('says "Not set" for properties an older event lacks', async () => {
    mockGetEvent({ id: 1, name: 'Event 1', description: 'First', company: 'GEEKFARM', color: 'red' })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Event details' })
    await within(dialog).findByText('GEEKFARM')

    const value = (label) => within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling
    for (const label of ['Status', 'Date and time', 'Email', 'Phone', 'Address', 'Created']) {
      expect(value(label).textContent).toBe('Not set')
    }
    expect(within(value('Image')).getByRole('img', { name: 'No image' })).toBeTruthy()
    expect(dialog.querySelector('img')).toBeNull()
  })

  it('shows one toast and a retry when the details fail to load', async () => {
    mockGetEvent(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Event details' })

    await within(dialog).findByRole('button', { name: 'Try again' })
    expect(within(toastRegion()).getAllByText("Couldn't load the event. Server error.")).toHaveLength(1)

    mockGetEvent({ ...EVENTS[0] })
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(await within(dialog).findByText('GEEKFARM')).toBeTruthy()
    // Focus moves to the loaded details rather than dropping to <body>.
    await waitFor(() => expect(document.activeElement).toBe(dialog.querySelector('.event-details')))
  })

  it('drops the event from the list when its details return 404', async () => {
    mockGetEvent(new api.ApiError('That event no longer exists.', { status: 404 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Event 1' }))

    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 2']))
    expect(within(screen.getByRole('dialog', { name: 'Event details' })).queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('editing an event', () => {
  it('puts an Edit button under each Delete button', async () => {
    renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const card = screen.getByRole('button', { name: 'Event 1' }).closest('li')
    const actions = within(card).getAllByRole('button').filter((button) => button.textContent !== 'Event 1')
    expect(actions.map((button) => button.getAttribute('aria-label'))).toEqual(['Delete Event 1', 'Edit Event 1'])
  })

  it('pre-fills and saves the new payload properties, including isActive', async () => {
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockImplementation(async (event) => event)
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await within(dialog).findByLabelText('Event name')

    const field = (label) => within(dialog).getByLabelText(label)
    expect(field('Date').value).toBe('2021-01-05')
    expect(field('Time').value).toBe('06:56')
    expect(field('Email').value).toBe('team@example.com')
    expect(field('Phone').value).toBe('+1 (831) 446-3332')
    expect(field('Address').value).toBe('697 Brooklyn Road, Northridge')
    expect(field('Image URL').value).toBe('https://example.com/event.png')
    expect(field('Active').checked).toBe(true)
    expect(field('Inactive').checked).toBe(false)

    await user.click(field('Inactive'))
    await user.clear(field('Email'))
    await user.type(field('Email'), 'new@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(api.updateEvent).toHaveBeenCalledWith({ ...EVENTS[0], isActive: false, email: 'new@example.com' })
    const card = (await screen.findByText('Inactive')).closest('li')
    expect(within(card).getByRole('button', { name: 'Event 1' })).toBeTruthy()
  })

  it('does not write an empty createdOn into an older record that had none', async () => {
    // As toEvent normalises it: a missing createdOn arrives as ''.
    mockGetEvent({ ...EVENTS[0], createdOn: '' })
    vi.mocked(api.updateEvent).mockImplementation(async (event) => event)
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await user.type(await within(dialog).findByLabelText('Event name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(api.updateEvent).toHaveBeenCalledTimes(1)
    expect(api.updateEvent.mock.calls[0][0]).not.toHaveProperty('createdOn')
  })

  it('guides the edit of an older event: names its missing fields and asks for a status', async () => {
    mockGetEvent({ id: 1, name: 'Event 1', description: 'First', company: 'GEEKFARM', color: 'red' })
    vi.mocked(api.updateEvent).mockImplementation(async (event) => event)
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await within(dialog).findByLabelText('Event name')

    const hint = () => dialog.querySelector('.form-hint').textContent
    expect(hint()).toBe(
      'This event is missing fields added since it was created: Date, Time, Email, Phone, ' +
        'Address, Image URL, Status. Fill them in to save.',
    )
    // A plain paragraph, not a live region, so it isn't re-read after every field.
    expect(dialog.querySelector('.form-hint').getAttribute('role')).toBeNull()
    // The errors show straight away, and no status is chosen for the user.
    expect(within(dialog).getByText('Email is required.')).toBeTruthy()
    expect(within(dialog).getByText('Choose whether the event is active.')).toBeTruthy()
    expect(within(dialog).getByLabelText('Active').checked).toBe(false)
    expect(within(dialog).getByLabelText('Inactive').checked).toBe(false)
    const group = within(dialog).getByRole('radiogroup', { name: 'Status' })
    expect(group.getAttribute('aria-required')).toBe('true')
    expect(group.getAttribute('aria-invalid')).toBe('true')

    await fillForm(user, dialog, { name: 'Event 1', description: 'First', company: 'GEEKFARM', color: 'red' })
    expect(hint()).toBe(
      'This event is missing a field added since it was created: Status. Fill it in to save.',
    )
    expect(within(dialog).getByRole('button', { name: 'Save changes' }).disabled).toBe(true)

    await user.click(within(dialog).getByLabelText('Inactive'))
    expect(hint()).toBe('All fields are required.')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(api.updateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, isActive: false, ...FORM_DEFAULTS }),
    )
  })

  it('says it is saving at the top of the form while the request runs', async () => {
    let resolveUpdate
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockReturnValue(new Promise((resolve) => (resolveUpdate = resolve)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await user.type(await within(dialog).findByLabelText('Event name'), '!')
    await user.keyboard('{Enter}')

    // Announced through the status region, and shown in the hint, which is the
    // first thing in the form, above the fields Enter was pressed in.
    expect(within(dialog).getByRole('status').textContent).toBe('Saving… Please wait.')
    const hint = dialog.querySelector('form').firstElementChild
    expect(hint.className).toBe('form-hint')
    expect(hint.textContent).toBe('Saving… Please wait.')
    // radiogroup carries the read-only state; radios don't support it.
    expect(within(dialog).getByRole('radiogroup').getAttribute('aria-readonly')).toBe('true')
    expect(dialog.querySelector('input[type="radio"][aria-readonly]')).toBeNull()
    resolveUpdate({ ...EVENTS[0], name: 'Event 1!' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps Save disabled while a new property is invalid', async () => {
    mockGetEvent({ ...EVENTS[0] })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    const email = await within(dialog).findByLabelText('Email')
    const save = within(dialog).getByRole('button', { name: 'Save changes' })

    await user.clear(email)
    await user.type(email, 'not-an-email')
    expect(save.disabled).toBe(true)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(within(dialog).getByText(/Enter an email address/)).toBeTruthy()

    await user.clear(email)
    await user.type(email, 'ok@example.com')
    expect(save.disabled).toBe(false)
  })

  it('opens the update form from the Edit button and returns focus to it', async () => {
    mockGetEvent({ ...EVENTS[0] })
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const edit = screen.getByRole('button', { name: 'Edit Event 1' })
    await user.click(edit)

    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    expect((await within(dialog).findByLabelText('Event name')).value).toBe('Event 1')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(edit)
  })

  it('loads the event by id, pre-fills the form and saves the full record', async () => {
    mockGetEvent({ ...EVENTS[0], tags: ['kept'] })
    vi.mocked(api.updateEvent).mockImplementation(async (event) => event)
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))

    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    expect(api.getEvent).toHaveBeenCalledWith(1, expect.anything())
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    const company = await within(dialog).findByLabelText('Company name')
    expect(company.value).toBe('GEEKFARM')

    const save = within(dialog).getByRole('button', { name: 'Save changes' })
    expect(save.disabled).toBe(true) // nothing changed yet
    await user.clear(company)
    await user.type(company, 'ZZZ Corp')
    await user.click(save)

    // The full record: edited fields, the rest of the payload (createdOn
    // included) and properties this app doesn't know about.
    expect(api.updateEvent).toHaveBeenCalledWith({ ...EVENTS[0], company: 'ZZZ Corp', tags: ['kept'] })
    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 2', 'Event 1']))
    // The re-sort moved this card to the end in the same commit that closed the
    // modal; focus still returns to its Edit button.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit Event 1' }))
  })

  it('shows a toast and leaves the list unchanged when an update fails', async () => {
    mockGetEvent({ ...EVENTS[0] })
    vi.mocked(api.updateEvent).mockRejectedValue(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    const company = await within(dialog).findByLabelText('Company name')
    await user.clear(company)
    await user.type(company, 'ZZZ Corp')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(within(toastRegion()).getByText("Couldn't update the event. Server error.")).toBeTruthy(),
    )
    expect(listedNames()).toEqual(['Event 3', 'Event 1', 'Event 2'])
    expect(within(screen.getByRole('list')).queryByText('ZZZ Corp')).toBeNull()
    expect(company.value).toBe('ZZZ Corp') // the form keeps the edit
    // The form mounted after the dialog (once its event loaded); the toast still
    // comes after it, below the buttons.
    const form = dialog.querySelector('form')
    expect(form.compareDocumentPosition(toastRegion()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows one toast and a retry when GET /events/{id} fails, then loads on retry', async () => {
    mockGetEvent(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })

    await within(dialog).findByRole('button', { name: 'Try again' })
    expect(api.getEvent).toHaveBeenCalledTimes(2) // premise: StrictMode aborted the first request
    expect(within(toastRegion()).getAllByText(/Couldn't load the event/)).toHaveLength(1)
    expect(within(toastRegion()).getByText("Couldn't load the event. Server error.")).toBeTruthy()
    expect(within(dialog).queryByLabelText('Event name')).toBeNull()

    mockGetEvent({ ...EVENTS[0] })
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect((await within(dialog).findByLabelText('Company name')).value).toBe('GEEKFARM')
  })

  it('drops the event from the list when GET /events/{id} returns 404', async () => {
    mockGetEvent(new api.ApiError('That event no longer exists.', { status: 404 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))

    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 2']))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    expect(within(dialog).queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(within(toastRegion()).getAllByText(/no longer exists/)).toHaveLength(1)
  })

  it('reports nothing when the edit modal is closed before its event loads', async () => {
    let failLoad
    vi.mocked(api.getEvent).mockImplementation(
      (_id, { signal } = {}) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          failLoad = reject
        }),
    )
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Edit Event 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    expect(within(dialog).getByRole('status').textContent).toBe('Loading event…')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // A request that wasn't aborted would still fail now and raise a toast.
    await act(async () => failLoad(new api.ApiError('Server error.', { status: 500 })))
    expect(within(toastRegion()).queryByText(/Couldn't load the event/)).toBeNull()
  })

  it('moves focus to the heading when closing an edit modal whose event was found deleted', async () => {
    mockGetEvent(new api.ApiError('That event no longer exists.', { status: 404 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    const opener = screen.getByRole('button', { name: 'Edit Event 1' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Edit event' })
    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 2']))
    expect(opener.isConnected).toBe(false) // premise: there is no opener to return to

    // The error body's Close button (the header one is the x icon).
    await user.click(within(dialog).getByText('Close', { selector: 'button' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })
})

describe('deleting an event', () => {
  it('removes the event only after the server confirms the delete', async () => {
    let resolveDelete
    vi.mocked(api.deleteEvent).mockReturnValue(new Promise((resolve) => (resolveDelete = resolve)))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))

    await user.click(screen.getByRole('button', { name: 'Delete Event 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete event' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(api.deleteEvent).toHaveBeenCalledWith(2)
    expect(listedNames()).toHaveLength(3)
    resolveDelete()
    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 1']))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }))
  })

  it('keeps the event and shows a toast when the delete fails', async () => {
    vi.mocked(api.deleteEvent).mockRejectedValue(new api.ApiError('Server error.', { status: 500 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))

    await user.click(screen.getByRole('button', { name: 'Delete Event 2' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete event' })).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => expect(within(toastRegion()).getByText(/Couldn't delete/)).toBeTruthy())
    expect(listedNames()).toHaveLength(3)
  })

  it('names an untitled event without blanks in the delete confirmation', async () => {
    mockGetEvents([{ id: 7, name: '', description: '', company: '', color: '' }])
    const user = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Delete Untitled event' }))
    const text = screen.getByRole('dialog', { name: 'Delete event' }).querySelector('.modal-text').textContent
    expect(text).toMatch(/^Delete event "Untitled event"\?/)
    expect(text).not.toMatch(/""|company/)
  })

  it('drops the event and shows a toast when the delete finds it already gone', async () => {
    vi.mocked(api.deleteEvent).mockRejectedValue(new api.ApiError('That event no longer exists.', { status: 404 }))
    const user = renderApp()
    await waitFor(() => expect(listedNames()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Delete Event 2' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete event' })).getByRole('button', { name: 'Delete' }),
    )

    await waitFor(() => expect(listedNames()).toEqual(['Event 3', 'Event 1']))
    expect(within(toastRegion()).getByText(/Couldn't delete the event\. That event no longer exists/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
