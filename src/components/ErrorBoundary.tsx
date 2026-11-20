import { Component, type ReactNode } from 'react'

/** A crash shows what broke and a way out, rather than a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="loading" role="alert">
        <p className="err">Something broke: {this.state.error.message}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
