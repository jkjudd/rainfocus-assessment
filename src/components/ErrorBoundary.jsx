import { Component } from 'react'

// Catches render errors anywhere below it so the page shows a way out instead
// of going blank. API failures are handled where they happen and never get here.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="list-status" role="alert">
        <h1>Something went wrong</h1>
        <p>The page hit an unexpected error. Reloading usually fixes it.</p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </main>
    )
  }
}
