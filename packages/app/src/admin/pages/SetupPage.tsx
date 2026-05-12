import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (password !== confirm) { setError('Parolele nu coincid.'); return }
    if (password.length < 8) { setError('Parola trebuie să aibă cel puțin 8 caractere.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Eroare la configurare.')
        setBusy(false)
        return
      }
      // Auto-login after setup
      await login(email, password)
      onDone()
    } catch {
      setError('Eroare de rețea.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6" data-testid="setup-form">
        <div>
          <h1 className="text-2xl font-bold mb-1">Configurare inițială</h1>
          <p className="text-sm font-content text-[var(--muted)]">
            Creează primul cont super-admin.
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm font-content" data-testid="setup-error">{error}</p>
        )}

        <div className="space-y-3">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            data-testid="setup-email"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-base font-content
                       focus:border-[var(--text)] outline-none transition-colors" />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Parolă (min. 8 caractere)"
            data-testid="setup-password"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-base font-content
                       focus:border-[var(--text)] outline-none transition-colors" />
          <input
            type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirmă parola"
            data-testid="setup-confirm"
            className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-base font-content
                       focus:border-[var(--text)] outline-none transition-colors" />
        </div>

        <button
          onClick={submit} disabled={busy || !email || !password}
          data-testid="setup-submit"
          className="w-full py-3 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors
                     disabled:opacity-40">
          {busy ? 'Se configurează…' : 'Creează cont'}
        </button>
      </div>
    </div>
  )
}
