import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function ChangePasswordPage() {
  const { logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.auth.changePassword(current, next)
      setDone(true)
      setTimeout(logout, 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Schimbă parola</h1>
        <p className="text-sm font-content text-[var(--muted)] mb-6">
          Trebuie să schimbi parola înainte de a continua.
        </p>

        {done ? (
          <p className="text-sm font-content text-green-400" data-testid="change-success">
            Parolă schimbată. Redirecționare…
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="change-password-form">
            {error && <p className="text-red-400 text-sm font-content">{error}</p>}
            <input type="password" placeholder="Parola actuală" required value={current}
              onChange={e => setCurrent(e.target.value)}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm font-content" />
            <input type="password" placeholder="Parola nouă (min. 8 caractere)" required value={next}
              onChange={e => setNext(e.target.value)} minLength={8}
              className="w-full bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-sm font-content" />
            <button type="submit" disabled={busy}
              className="w-full py-3 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                         hover:border-[var(--accent)] transition-colors disabled:opacity-40">
              {busy ? 'Se salvează…' : 'Salvează parola'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
