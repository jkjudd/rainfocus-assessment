// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastProvider from './ToastProvider.jsx'
import { useToast } from './toastContext.js'

function Trigger({ toasts }) {
  const showToast = useToast()
  return (
    <button type="button" onClick={() => toasts.forEach(([message, options]) => showToast(message, options))}>
      Notify
    </button>
  )
}

function renderProvider(toasts) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <ToastProvider>
      <Trigger toasts={toasts} />
    </ToastProvider>,
  )
  return user
}

const toastRegion = () => screen.getByRole('region', { name: 'Notifications' })
// The live regions have no role, so find them by their politeness.
const liveRegion = (politeness) => document.querySelector(`[aria-live="${politeness}"]`)

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ToastProvider', () => {
  it('announces toasts that arrive together as one message, errors assertively', async () => {
    const user = renderProvider([['First failed.'], ['Second failed.'], ['Saved.', { type: 'success' }]])
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    expect(liveRegion('assertive').textContent).toBe('') // filled only after the delay

    act(() => vi.advanceTimersByTime(150))
    expect(liveRegion('assertive').textContent).toBe('First failed. Second failed.')
    expect(liveRegion('polite').textContent).toBe('Saved.')
  })

  it('keeps a toast while it has focus, and restarts its timer when focus leaves', async () => {
    const user = renderProvider([['Saved.', { type: 'success' }]])
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss notification' }))

    act(() => vi.advanceTimersByTime(20000))
    expect(within(toastRegion()).getByText('Saved.')).toBeTruthy()

    await user.tab()
    expect(document.activeElement).not.toBe(screen.queryByRole('button', { name: 'Dismiss notification' }))
    act(() => vi.advanceTimersByTime(5100))
    expect(within(toastRegion()).queryByText('Saved.')).toBeNull()
  })

  it('moves focus to the next toast, then back to where it came from, as toasts are dismissed', async () => {
    const user = renderProvider([['First failed.'], ['Second failed.']])
    const notify = screen.getByRole('button', { name: 'Notify' })
    await user.click(notify)
    await user.tab()
    const [first, second] = screen.getAllByRole('button', { name: 'Dismiss notification' })
    expect(document.activeElement).toBe(first)

    await user.keyboard('{Enter}')
    expect(within(toastRegion()).queryByText('First failed.')).toBeNull()
    expect(document.activeElement).toBe(second)

    await user.keyboard('{Enter}')
    expect(within(toastRegion()).queryByText('Second failed.')).toBeNull()
    expect(document.activeElement).toBe(notify)
  })

  it('replaces an identical error toast instead of stacking another', async () => {
    const user = renderProvider([['Server down.']])
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    expect(within(toastRegion()).getAllByText('Server down.')).toHaveLength(1)

    // Still announced each time.
    act(() => vi.advanceTimersByTime(150))
    expect(liveRegion('assertive').textContent).toBe('Server down.')
  })

  it('keeps error toasts with no timer, even after a pause and resume', async () => {
    const user = renderProvider([['Server down.'], ['Saved.', { type: 'success' }]])
    await user.click(screen.getByRole('button', { name: 'Notify' }))
    await user.hover(toastRegion())
    await user.unhover(toastRegion())

    act(() => vi.advanceTimersByTime(60 * 60 * 1000))
    expect(within(toastRegion()).getByText('Server down.')).toBeTruthy()
    expect(within(toastRegion()).queryByText('Saved.')).toBeNull()
  })
})
