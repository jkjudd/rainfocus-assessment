const BASE_URL = 'https://rf-json-server.herokuapp.com/events/'
const TIMEOUT_MS = 15000

// Every failure the UI should report (network, timeout, HTTP status, bad body)
// surfaces as an ApiError, so callers only need one catch path.
export class ApiError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
  }
}

// A caller cancelling its own request (e.g. a modal closing) is not a failure.
export function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function describeError(error) {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
}

function messageForStatus(status) {
  if (status === 404) return 'That event no longer exists.'
  if (status === 400 || status === 422) return 'The server rejected the event data.'
  if (status >= 500) return 'The events server is having trouble. Try again shortly.'
  return `The events server returned an unexpected error (${status}).`
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
      signal: combinedSignal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    if (timeout.aborted) {
      throw new ApiError('The events server took too long to respond.', { cause: error })
    }
    throw new ApiError('Could not reach the events server. Check your connection.', {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new ApiError(messageForStatus(response.status), { status: response.status })
  }

  try {
    return await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('The events server sent a response that could not be read.', {
      cause: error,
    })
  }
}

// The server is a shared json-server instance, so guard against records that are
// missing fields rather than trusting every row to match the expected shape.
function toEvent(raw) {
  if (!raw || typeof raw !== 'object' || raw.id == null) {
    throw new ApiError('The events server sent an event in an unexpected format.')
  }
  const text = (value) => String(value ?? '')
  return {
    ...raw,
    name: text(raw.name),
    description: text(raw.description),
    company: text(raw.company),
    color: text(raw.color),
    date: text(raw.date),
    time: text(raw.time),
    email: text(raw.email),
    phone: text(raw.phone),
    address: text(raw.address),
    image: text(raw.image),
    createdOn: text(raw.createdOn),
    // Left undefined when missing or malformed, so the UI can say "not set".
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : undefined,
  }
}

export async function getEvents({ signal } = {}) {
  const data = await request('', { signal })
  if (!Array.isArray(data)) {
    throw new ApiError('The events server sent the event list in an unexpected format.')
  }
  return data.map(toEvent)
}

export async function getEvent(id, { signal } = {}) {
  return toEvent(await request(encodeURIComponent(id), { signal }))
}

// fields: the event's properties, as in the API's example payload (name,
// description, company, color, isActive, date, time, email, phone, address,
// image, createdOn). The server assigns the id.
export async function createEvent(fields) {
  return toEvent(await request('', { method: 'POST', body: fields }))
}

// PUT replaces the whole record, so the caller passes the full event it loaded
// (including fields this app doesn't edit) with the edited fields merged in.
export async function updateEvent(event) {
  return toEvent(
    await request(encodeURIComponent(event.id), { method: 'PUT', body: event }),
  )
}

export async function deleteEvent(id) {
  await request(encodeURIComponent(id), { method: 'DELETE' })
}
