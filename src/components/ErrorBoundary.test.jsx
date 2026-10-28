// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'

function Broken() {
  throw new Error('boom')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('shows a way out instead of a blank page when a render throws', () => {
  // React logs errors a boundary catches; keep that out of the test output.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
})
