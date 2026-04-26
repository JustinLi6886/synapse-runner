import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  state = { hasError: false, error: undefined as Error | undefined }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="app-viewport p-6 font-sans text-foreground">
          <h1 className="text-xl font-semibold text-destructive">Something went wrong</h1>
          <pre className="mt-4 overflow-auto text-sm">{this.state.error.message}</pre>
          <pre className="mt-2 overflow-auto text-xs opacity-80">{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
