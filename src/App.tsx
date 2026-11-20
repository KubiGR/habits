import { ErrorBoundary } from './components/ErrorBoundary'
import { Gate } from './components/Gate'

export default function App() {
  return (
    <ErrorBoundary>
      <Gate />
    </ErrorBoundary>
  )
}
