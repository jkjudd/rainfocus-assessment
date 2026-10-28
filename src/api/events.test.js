import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createEvent, deleteEvent, getEvent, getEvents, updateEvent } from './events.js'

const BASE_URL = 'https://rf-json-server.herokuapp.com/events/'

function mockFetch(impl) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// What toEvent fills in for an event that has none of the optional properties.
const BLANK_EVENT = {
  name: '',
  description: '',
  company: '',
  color: '',
  date: '',
  time: '',
  email: '',
  phone: '',
  address: '',
  image: '',
  createdOn: '',
  isActive: undefined,
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('events API by id and failure kinds', () => {
  it('gets one event from /events/{id} with the caller signal', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 3, name: 'A' }))
    const controller = new AbortController()
    const event = await getEvent(3, { signal: controller.signal })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}3`)
    expect(init.method).toBe('GET')
    controller.abort()
    expect(init.signal.aborted).toBe(true)
    expect(event).toEqual({ ...BLANK_EVENT, id: 3, name: 'A' })
  })

  it('deletes with DELETE on /events/{id}', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({}))
    await deleteEvent(4)
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}4`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('reports a timeout as its own ApiError', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(
      AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')),
    )
    mockFetch(async (_url, init) => init.signal.throwIfAborted())
    const error = await getEvents().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toMatch(/took too long/)
  })

  it('reports a body that is not JSON as an ApiError', async () => {
    mockFetch(async () => new Response('<html>', { status: 200 }))
    const error = await getEvents().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toMatch(/could not be read/)
  })

  it('gives a 404 its own message and status', async () => {
    mockFetch(async () => jsonResponse({}, 404))
    const error = await getEvent(99).catch((e) => e)
    expect(error).toMatchObject({ name: 'ApiError', status: 404, message: 'That event no longer exists.' })
  })
})

describe('events API', () => {
  it('loads events and fills in missing text fields', async () => {
    mockFetch(async () => jsonResponse([{ id: 1, name: 'A', company: 'X' }]))
    const events = await getEvents()
    expect(events).toEqual([{ ...BLANK_EVENT, id: 1, name: 'A', company: 'X' }])
  })

  it('keeps the payload properties the server sends, and only a boolean isActive', async () => {
    const full = {
      id: 1,
      color: 'red',
      isActive: false,
      name: 'Event 1',
      date: '2021-01-05',
      time: '06:56',
      company: 'GEEKFARM',
      email: 'wallsschwartz@geekfarm.com',
      phone: '+1 (831) 446-3332',
      address: '697 Brooklyn Road, Northridge, Tennessee, 186',
      description: 'Cillum',
      image: 'https://placeimg.com/320/240/arch',
      createdOn: '2020-09-05T03:56:56 +06:00',
    }
    mockFetch(async () => jsonResponse([full, { id: 2, isActive: 'yes' }]))
    const [first, second] = await getEvents()
    expect(first).toEqual(full)
    expect(second.isActive).toBeUndefined()
  })

  it('posts only the given fields as JSON', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 9, name: 'A' }, 201))
    const fields = { name: 'A', description: 'B', company: 'C', color: 'red' }
    await createEvent(fields)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(BASE_URL)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(fields)
  })

  it('puts the full event, including its id, to the event URL', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 3, name: 'A' }))
    await updateEvent({ id: 3, name: 'A', date: '2021-01-01' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}3`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ id: 3, name: 'A', date: '2021-01-01' })
  })

  it('turns HTTP errors into an ApiError with the status', async () => {
    mockFetch(async () => jsonResponse({}, 500))
    const error = await createEvent({}).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
  })

  it('turns network failures into an ApiError', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(deleteEvent(1)).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects a created event that comes back without an id', async () => {
    mockFetch(async () => jsonResponse({ name: 'A' }, 201))
    await expect(createEvent({ name: 'A' })).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects an event list that is not an array', async () => {
    mockFetch(async () => jsonResponse({ error: 'nope' }))
    await expect(getEvents()).rejects.toBeInstanceOf(ApiError)
  })

  it('passes caller aborts through instead of reporting them as failures', async () => {
    const controller = new AbortController()
    mockFetch(async (_url, init) => {
      controller.abort()
      init.signal.throwIfAborted()
    })
    const error = await getEvents({ signal: controller.signal }).catch((e) => e)
    expect(error.name).toBe('AbortError')
  })
})
