import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { SqlQueryError, SqlQueryErrorKind, SqlQueryResult } from '@betel/shared'
import { api } from '../api/client'
import SqlConfirmModal from '../components/sql/SqlConfirmModal'

const ERROR_LABELS: Record<SqlQueryErrorKind, string> = {
  invalid:   'Interogare invalidă',
  blocked:   'Comandă blocată',
  database:  'Eroare PostgreSQL',
  read_only: 'Mod doar citire',
  timeout:   'Timp depășit',
  unavailable: 'Consolă indisponibilă',
}

function toSqlError(err: unknown): SqlQueryError {
  const data = (err as { data?: Partial<SqlQueryError> })?.data
  if (data?.kind) return data as SqlQueryError
  return { kind: 'database', error: (err as Error)?.message ?? 'Eroare necunoscută' }
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return <span className="text-[var(--muted)] italic">NULL</span>
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** The offending line of the query with a caret under the reported column. */
function ErrorLocation({ query, line, column }: { query: string; line: number; column: number }) {
  const text = query.split('\n')[line - 1] ?? ''
  return (
    <pre data-testid="sql-error-location" className="font-mono text-xs mt-3 overflow-x-auto text-[var(--text)]">
      {text}{'\n'}
      <span className="text-[var(--accent)]">{' '.repeat(Math.max(0, column - 1))}^</span>
    </pre>
  )
}

function ErrorPanel({ error, query }: { error: SqlQueryError; query: string }) {
  return (
    <div data-testid="sql-error" data-kind={error.kind}
      className="border border-[var(--border)] border-l-2 border-l-[var(--accent)] p-4 mb-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <span className="text-xs uppercase tracking-widest font-content text-[var(--accent)]">
          {ERROR_LABELS[error.kind]}
        </span>
        {error.line !== undefined && (
          <span className="text-xs font-content text-[var(--muted)]">
            linia {error.line}, coloana {error.column}
          </span>
        )}
        {error.pgCode && <span className="text-xs font-mono text-[var(--muted)]">{error.pgCode}</span>}
      </div>
      <p data-testid="sql-error-message" className="font-mono text-sm break-words">{error.error}</p>
      {error.detail && <p className="font-mono text-xs text-[var(--muted)] mt-2">{error.detail}</p>}
      {error.line !== undefined && error.column !== undefined && (
        <ErrorLocation query={query} line={error.line} column={error.column} />
      )}
      {error.hint && (
        <p data-testid="sql-error-hint" className="font-content text-xs text-[var(--muted)] mt-3">
          Sugestie: {error.hint}
        </p>
      )}
    </div>
  )
}

function ResultTable({ result }: { result: SqlQueryResult }) {
  const columns = result.columns.map(c => c.name)
  return (
    <div>
      <p data-testid="sql-result-meta" className="text-xs font-content text-[var(--muted)] uppercase tracking-widest mb-3">
        {result.command || 'OK'} · {result.rowCount}{result.truncated ? '+' : ''} {result.rowCount === 1 && !result.truncated ? 'rând' : 'rânduri'} · {result.durationMs} ms
      </p>
      {result.truncated && (
        <p data-testid="sql-result-truncated" className="text-xs font-content text-[var(--accent)] mb-3">
          Sunt afișate doar primele {result.rows.length} rânduri. Adaugă LIMIT sau filtre pentru a restrânge rezultatul.
        </p>
      )}
      {columns.length > 0 && (
        <div className="overflow-x-auto border border-[var(--border)]">
          <table data-testid="sql-result-table" className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                {columns.map(c => (
                  <th key={c} className="text-left px-3 py-2 font-normal text-[var(--muted)] whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.length === 0 && (
                <tr><td colSpan={columns.length} className="px-3 py-4 text-center text-[var(--muted)] font-content">Niciun rând.</td></tr>
              )}
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-b-0 align-top hover:bg-[var(--surface)]">
                  {columns.map(c => (
                    <td key={c} className="px-3 py-1.5 max-w-[320px] whitespace-pre-wrap break-words">{formatCell(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function SqlConsolePage() {
  const [query, setQuery] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [confirming, setConfirming] = useState(false)
  // The query actually sent, so the error caret matches even if the editor changed since
  const [ranQuery, setRanQuery] = useState('')

  const run = useMutation({
    mutationFn: (v: { query: string; readOnly: boolean }) => api.sql.run(v.query, v.readOnly),
  })

  function requestRun() {
    if (!query.trim() || run.isPending) return
    setConfirming(true)
  }

  function confirmRun() {
    setConfirming(false)
    setRanQuery(query)
    run.mutate({ query, readOnly })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">
          <span className="betel-title-bold">CONSOLĂ</span>{' '}
          <span className="betel-title-condensed text-[var(--accent)]">SQL</span>
        </h1>
        <span className="text-xs font-content text-[var(--muted)] uppercase tracking-widest">
          Super-admin only
        </span>
      </div>

      <p className="font-content text-sm text-[var(--muted)] mb-4 max-w-2xl">
        O singură instrucțiune pe rulare, limită de 10 secunde și maximum 500 de rânduri afișate.
        Comenzile de schemă (CREATE, ALTER, DROP), TRUNCATE și modificările fără WHERE sunt blocate.
      </p>

      <textarea
        data-testid="sql-editor"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); requestRun() }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={8}
        placeholder="SELECT slug, name FROM sites;"
        aria-label="Interogare SQL"
        className="w-full font-mono text-sm bg-[var(--surface)] border border-[var(--border)] p-3 resize-y
                   placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 mb-8">
        <label className="flex items-center gap-2 text-xs font-content uppercase tracking-widest cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="sql-read-only"
            checked={readOnly}
            onChange={e => setReadOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Doar citire
          {!readOnly && <span className="normal-case tracking-normal text-[var(--accent)]">— modificările sunt permise</span>}
        </label>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[11px] font-content text-[var(--muted)]">Ctrl/⌘ + Enter</span>
          <button
            data-testid="sql-run"
            onClick={requestRun}
            disabled={!query.trim() || run.isPending}
            className="px-5 py-2 rounded-full bg-[var(--text)] text-[var(--bg)] text-xs tracking-widest uppercase font-content
                       hover:opacity-90 transition-opacity disabled:opacity-30">
            {run.isPending ? 'Se rulează…' : 'Rulează'}
          </button>
        </div>
      </div>

      {run.isError && <ErrorPanel error={toSqlError(run.error)} query={ranQuery} />}
      {run.isSuccess && <ResultTable result={run.data} />}

      {confirming && (
        <SqlConfirmModal
          query={query}
          readOnly={readOnly}
          onConfirm={confirmRun}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}
