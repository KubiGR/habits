import { ErrorBoundary } from './components/ErrorBoundary'
import { Tracker } from './components/Tracker'
import { httpBackend } from './lib/http'

export default function App() {
  return (
    <ErrorBoundary>
      <Tracker backend={httpBackend} />
    </ErrorBoundary>
  )
}
