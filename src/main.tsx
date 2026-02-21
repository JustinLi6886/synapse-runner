import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
  setTimeout(() => {
    import('./nn/debug').then((m) => m.registerNNDemos()).catch(() => {})
  }, 0)
}

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
        <div style={{ padding: 24, fontFamily: 'system-ui', color: '#E2E8F0', background: '#0F1115', minHeight: '100vh' }}>
          <h1 style={{ color: '#EF4444' }}>Something went wrong</h1>
          <pre style={{ overflow: 'auto', marginTop: 16 }}>{this.state.error.message}</pre>
          <pre style={{ overflow: 'auto', marginTop: 8, fontSize: 12, opacity: 0.8 }}>{this.state.error.stack}</pre>
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
