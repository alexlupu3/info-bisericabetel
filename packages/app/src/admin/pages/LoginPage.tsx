import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message ?? 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl mb-1">
          <span className="font-bold block">BETEL</span>
          <span className="font-light text-[var(--muted)] text-xl tracking-widest">ADMIN</span>
        </h1>
        <div className="mt-6 h-px w-6 bg-[var(--accent)]" />

        <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
          {error && (
            <p className="text-red-400 text-sm font-content" data-testid="login-error">{error}</p>
          )}
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
              Email
            </label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              data-testid="login-email"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3
                         text-base font-content text-[var(--text)] focus:outline-none
                         focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
              Password
            </label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              data-testid="login-password"
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3
                         text-base font-content text-[var(--text)] focus:outline-none
                         focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="submit" disabled={busy}
            data-testid="login-submit"
            className="w-full py-3 border border-[var(--text)] text-xs tracking-widest
                       uppercase font-content hover:border-[var(--accent)]
                       hover:text-[var(--accent)] transition-colors disabled:opacity-40"
          >
            {busy ? 'Se autentifică…' : 'Autentificare'}
          </button>
        </form>

        <p className="mt-6 text-xs font-content text-[var(--muted)] text-center">
          Prima instalare?{' '}
          <Link to="setup" className="underline hover:text-[var(--text)] transition-colors"
                data-testid="setup-link">
            Configurare inițială
          </Link>
        </p>
      </div>
    </div>
  )
}
