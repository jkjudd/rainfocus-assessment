// No test may reach the shared public events server. Assigned directly (not
// with vi.stubGlobal) so vi.unstubAllGlobals() in API tests restores this guard
// rather than the real fetch.
globalThis.fetch = async (url) => {
  throw new Error(`Unexpected network request in a test: ${url}`)
}
