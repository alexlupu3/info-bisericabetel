import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useToast } from '../context/ToastContext'

const ROLES = ['admin', 'super-admin'] as const

export default function UsersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: api.users.list })
  const [creating, setCreating] = useState(false)
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null)

  const deleteMut = useMutation({
    mutationFn: api.users.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast('Utilizator șters') },
  })

  const resetMut = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.users.resetPassword(id).then(r => ({ ...r, email })),
    onSuccess: r => { setResetResult({ email: r.email, tempPassword: r.tempPassword }) },
    onError: (err: any) => toast(err.message ?? 'Eroare la resetare parolă'),
  })

  const users = data?.users ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Utilizatori</h1>
        <button
          onClick={() => setCreating(true)}
          data-testid="create-user-btn"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
          + Adaugă
        </button>
      </div>

      {creating && (
        <CreateUserForm
          onClose={() => setCreating(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setCreating(false); toast('Utilizator creat') }}
        />
      )}

      {resetResult && (
        <div className="border border-[var(--border)] p-4 mb-6 space-y-4" data-testid="reset-password-display">
          <p className="text-sm font-content text-green-400">Parola a fost resetată pentru <strong>{resetResult.email}</strong>.</p>
          <div className="space-y-1">
            <p className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">Parolă temporară</p>
            <p className="font-mono text-lg tracking-wider border border-[var(--border)] px-4 py-2 bg-[var(--surface)] select-all"
               data-testid="reset-password-value">
              {resetResult.tempPassword}
            </p>
            <p className="text-xs font-content text-[var(--muted)]">
              Transmite această parolă utilizatorului. Va fi obligat să o schimbe la următoarea conectare.
            </p>
          </div>
          <button onClick={() => setResetResult(null)}
            className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                       hover:border-[var(--accent)] transition-colors">
            Gata
          </button>
        </div>
      )}

      {isLoading && <p className="text-[var(--muted)] font-content text-sm">Se încarcă…</p>}

      <ul className="space-y-2" data-testid="users-list">
        {users.map(user => (
          <li key={user.id}
              data-testid={`user-row-${user.id}`}
              className="flex items-center gap-4 border border-[var(--border)] px-4 py-3">
            <span className="flex-1 text-sm font-content">{user.email}</span>
            <span className="text-xs tracking-widest uppercase font-content text-[var(--muted)] flex-shrink-0">
              {user.role}
            </span>
            {user.mustChangePassword && (
              <span className="text-xs font-content text-yellow-400 flex-shrink-0">parolă temp</span>
            )}
            {user.role === 'admin' && (
              <button
                onClick={() => { if (confirm(`Resetezi parola pentru ${user.email}?`)) resetMut.mutate({ id: user.id, email: user.email }) }}
                disabled={resetMut.isPending}
                data-testid={`reset-password-btn-${user.id}`}
                className="text-xs font-content text-[var(--muted)] hover:text-yellow-400 transition-colors flex-shrink-0 disabled:opacity-40">
                Resetează parola
              </button>
            )}
            <button
              onClick={() => { if (confirm(`Ștergi utilizatorul ${user.email}?`)) deleteMut.mutate(user.id) }}
              className="text-xs font-content text-[var(--muted)] hover:text-red-400 transition-colors flex-shrink-0">
              Șterge
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CreateUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('admin')
  const [tempPassword, setTempPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.users.create(email, role)
      setTempPassword(result.tempPassword)
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (tempPassword) {
    return (
      <div className="border border-[var(--border)] p-4 mb-6 space-y-4" data-testid="temp-password-display">
        <p className="text-sm font-content text-green-400">Utilizator creat cu succes.</p>
        <div className="space-y-1">
          <p className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">Parolă temporară</p>
          <p className="font-mono text-lg tracking-wider border border-[var(--border)] px-4 py-2 bg-[var(--surface)] select-all"
             data-testid="temp-password-value">
            {tempPassword}
          </p>
          <p className="text-xs font-content text-[var(--muted)]">
            Transmite această parolă utilizatorului. Va fi obligat să o schimbe la prima conectare.
          </p>
        </div>
        <button onClick={onCreated}
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] transition-colors">
          Gata
        </button>
      </div>
    )
  }

  return (
    <div className="border border-[var(--border)] p-4 mb-6 space-y-3" data-testid="create-user-form">
      {error && <p className="text-red-400 text-sm font-content" data-testid="create-user-error">{error}</p>}
      <input
        value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email"
        type="email"
        data-testid="create-user-email"
        className="w-full bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content" />
      <select value={role} onChange={e => setRole(e.target.value)}
        data-testid="create-user-role"
        className="bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-content">
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <div className="flex gap-3">
        <button onClick={submit} disabled={busy || !email}
          data-testid="create-user-submit"
          className="px-4 py-2 border border-[var(--text)] text-xs tracking-widest uppercase font-content
                     hover:border-[var(--accent)] transition-colors disabled:opacity-40">
          {busy ? 'Se creează…' : 'Creează'}
        </button>
        <button onClick={onClose}
          className="px-4 py-2 text-xs tracking-widest uppercase font-content text-[var(--muted)]">
          Anulează
        </button>
      </div>
    </div>
  )
}
