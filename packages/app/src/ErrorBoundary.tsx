import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100dvh',
            backgroundColor: 'var(--bg)',
            color: 'var(--text)',
            gap: '1rem',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1rem' }}>
            A apărut o eroare. Încearcă din nou.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.25rem',
              border: '1px solid var(--muted)',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Reîncearcă
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
