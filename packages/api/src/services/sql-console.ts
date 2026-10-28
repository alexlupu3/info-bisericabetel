import type { SqlQueryError, SqlQueryResult } from '@betel/shared'
import { sql } from '../db/client.js'

export const MAX_QUERY_LENGTH = 20_000
export const ROW_LIMIT = 500
export const STATEMENT_TIMEOUT_MS = 10_000

// Statements that are never allowed, whatever the mode. Schema changes belong
// in a migration; transaction control and session settings would undo the
// guardrails (read-only transaction, statement timeout) set around the query.
const BLOCKED_LEADING: Record<string, string> = {
  CREATE:     'Schema changes (CREATE) are not allowed; add a migration instead.',
  ALTER:      'Schema changes (ALTER) are not allowed; add a migration instead.',
  DROP:       'DROP is not allowed.',
  TRUNCATE:   'TRUNCATE is not allowed.',
  COMMENT:    'Schema changes (COMMENT ON) are not allowed; add a migration instead.',
  GRANT:      'Privilege changes (GRANT) are not allowed.',
  REVOKE:     'Privilege changes (REVOKE) are not allowed.',
  REASSIGN:   'Ownership changes (REASSIGN OWNED) are not allowed.',
  SECURITY:   'SECURITY LABEL is not allowed.',
  COPY:       'COPY can read or write server files and is not allowed.',
  DO:         'Anonymous code blocks (DO) are not allowed.',
  CALL:       'Calling procedures is not allowed.',
  LOAD:       'Loading shared libraries is not allowed.',
  SET:        'Changing session settings (SET) is not allowed.',
  RESET:      'Changing session settings (RESET) is not allowed.',
  BEGIN:      'Transaction control is not allowed; each query runs in its own transaction.',
  START:      'Transaction control is not allowed; each query runs in its own transaction.',
  COMMIT:     'Transaction control is not allowed; each query runs in its own transaction.',
  END:        'Transaction control is not allowed; each query runs in its own transaction.',
  ROLLBACK:   'Transaction control is not allowed; each query runs in its own transaction.',
  ABORT:      'Transaction control is not allowed; each query runs in its own transaction.',
  SAVEPOINT:  'Transaction control is not allowed; each query runs in its own transaction.',
  RELEASE:    'Transaction control is not allowed; each query runs in its own transaction.',
  PREPARE:    'Prepared statements and transactions are not allowed.',
  EXECUTE:    'Prepared statements are not allowed.',
  DEALLOCATE: 'Prepared statements are not allowed.',
  LOCK:       'Explicit table locks are not allowed.',
  DISCARD:    'DISCARD is not allowed.',
  CHECKPOINT: 'Server maintenance commands are not allowed.',
  VACUUM:     'Server maintenance commands are not allowed.',
  CLUSTER:    'Server maintenance commands are not allowed.',
  REINDEX:    'Server maintenance commands are not allowed.',
  IMPORT:     'IMPORT FOREIGN SCHEMA is not allowed.',
}

// Keywords that are dangerous wherever they appear (e.g. inside EXPLAIN or a CTE).
const BLOCKED_ANYWHERE = new Set(['DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE', 'COPY'])

// Functions that touch the server's file system, other backends or
// configuration, or run a query string that would bypass this filter. Large
// object functions (lo_*) are blocked by prefix in validateSql.
const BLOCKED_FUNCTIONS = new Set([
  'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_ls_logdir', 'pg_ls_waldir',
  'pg_ls_tmpdir', 'pg_ls_archive_statusdir', 'pg_stat_file', 'pg_file_write',
  'pg_file_rename', 'pg_file_unlink',
  'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf', 'pg_rotate_logfile',
  'pg_promote', 'pg_switch_wal', 'pg_create_restore_point', 'set_config', 'pg_sleep',
  'pg_sleep_for', 'pg_sleep_until', 'dblink', 'dblink_exec', 'dblink_connect',
  'query_to_xml', 'query_to_xml_and_xmlschema', 'query_to_xmlschema', 'cursor_to_xml',
])

// Relations a data-changing statement may not mention: credentials, the audit
// trail that records console use, migration bookkeeping, and pg_settings (an
// UPDATE on it calls set_config, which could switch back from the console role).
// The database role enforces the table part too; this gives a clearer error.
const PROTECTED_TABLES = new Set(['users', 'audit_log', '_migrations', 'pg_settings'])

// Statements that can run as a server-side cursor, so only ROW_LIMIT + 1 rows are fetched
const CURSOR_LEADING = new Set(['SELECT', 'WITH', 'VALUES', 'TABLE'])
// Utility statements with small output that the protocol-level cursor does not return
const DIRECT_LEADING = new Set(['EXPLAIN', 'SHOW'])

/** Role every console query runs as; created by migration 0012_sql_console_role.sql. */
export const SQL_CONSOLE_ROLE = 'betel_sql_console'
const CURSOR_NAME = 'sql_console_cursor'
const CURSOR_PREFIX = `DECLARE ${CURSOR_NAME} NO SCROLL CURSOR FOR `

const WRITE_KEYWORDS = new Set(['INSERT', 'UPDATE', 'DELETE', 'MERGE'])

interface Token {
  value: string   // upper-cased for words, the character itself for punctuation
  raw: string
  position: number // 0-based offset into the query
  depth: number    // parenthesis depth
}

/** How a validated statement should be executed. */
export interface SqlPlan {
  /** First keyword, upper-cased (SELECT, UPDATE, EXPLAIN, ...) */
  leading: string
  /** Read-only statement that can be wrapped in DECLARE ... CURSOR */
  cursorable: boolean
  /** The statement without its trailing ";" and anything after it */
  statement: string
}

type Validation =
  | { ok: true; plan: SqlPlan }
  | { ok: false; error: SqlQueryError }

export function lineAndColumn(query: string, position: number) {
  const before = query.slice(0, Math.max(0, position - 1))
  const lines = before.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

function fail(query: string, kind: SqlQueryError['kind'], error: string, offset?: number, hint?: string): Validation {
  const err: SqlQueryError = { kind, error }
  if (offset !== undefined) {
    err.position = offset + 1
    Object.assign(err, lineAndColumn(query, err.position))
  }
  if (hint) err.hint = hint
  return { ok: false, error: err }
}

/**
 * Replaces comments, string literals, quoted identifiers and dollar-quoted
 * bodies with spaces (keeping offsets intact), so keyword checks only see code.
 */
export function scrubSql(query: string): { text: string } | { unterminated: string; offset: number } {
  const out = query.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < query.length) {
    const c = query[i]
    const next = query[i + 1]

    if (c === '-' && next === '-') {
      const end = query.indexOf('\n', i)
      const stop = end === -1 ? query.length : end
      blank(i, stop); i = stop; continue
    }

    if (c === '/' && next === '*') {
      // PostgreSQL block comments nest
      let depth = 1, j = i + 2
      while (j < query.length && depth > 0) {
        if (query[j] === '/' && query[j + 1] === '*') { depth++; j += 2 }
        else if (query[j] === '*' && query[j + 1] === '/') { depth--; j += 2 }
        else j++
      }
      if (depth > 0) return { unterminated: 'block comment', offset: i }
      blank(i, j); i = j; continue
    }

    if (c === "'" || c === '"') {
      const escapes = c === "'" && i > 0 && /[eE]/.test(query[i - 1]) && !/\w/.test(query[i - 2] ?? '')
      let j = i + 1
      let closed = false
      while (j < query.length) {
        if (escapes && query[j] === '\\') { j += 2; continue }
        if (query[j] === c) {
          if (query[j + 1] === c) { j += 2; continue }
          closed = true; j++; break
        }
        j++
      }
      if (!closed) return { unterminated: c === "'" ? 'string literal' : 'quoted identifier', offset: i }
      // Simple quoted identifiers ("users") stay visible so table checks still see them
      if (c === '"' && /^"[A-Za-z_][A-Za-z0-9_]*"$/.test(query.slice(i, j))) { out[i] = ' '; out[j - 1] = ' ' }
      else blank(i, j)
      i = j; continue
    }

    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(query.slice(i))
      if (m && !/\w/.test(query[i - 1] ?? '')) {
        const tag = m[0]
        const end = query.indexOf(tag, i + tag.length)
        if (end === -1) return { unterminated: 'dollar-quoted string', offset: i }
        blank(i, end + tag.length); i = end + tag.length; continue
      }
    }

    i++
  }
  return { text: out.join('') }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let depth = 0
  const re = /[A-Za-z_][A-Za-z0-9_$]*|[();.]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[0]
    if (raw === ')') depth--
    tokens.push({ value: /^[A-Za-z_]/.test(raw) ? raw.toUpperCase() : raw, raw, position: m.index, depth })
    if (raw === '(') depth++
  }
  return tokens
}

/** True when the UPDATE/DELETE keyword at `i` starts a data modification (not `FOR UPDATE`, `ON DELETE`, ...). */
function isModifyingKeyword(tokens: Token[], i: number) {
  const prev = tokens[i - 1]?.value
  if (tokens[i].value === 'UPDATE') return prev !== 'FOR' && prev !== 'KEY' && prev !== 'ON' && prev !== 'DO'
  return prev !== 'ON'
}

/** Looks for a WHERE at the same nesting level as the UPDATE/DELETE at `i`. */
function hasOwnWhere(tokens: Token[], i: number) {
  const depth = tokens[i].depth
  for (let k = i + 1; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.depth < depth) return false
    if (t.depth === depth && t.value === 'WHERE') return true
  }
  return false
}

export function validateSql(query: string, readOnly: boolean): Validation {
  if (!query.trim()) return fail(query, 'invalid', 'The query is empty.')
  if (query.length > MAX_QUERY_LENGTH) {
    return fail(query, 'invalid', `The query is too long (${query.length} characters, maximum ${MAX_QUERY_LENGTH}).`)
  }

  const scrubbed = scrubSql(query)
  if ('unterminated' in scrubbed) {
    return fail(query, 'invalid', `Unterminated ${scrubbed.unterminated}.`, scrubbed.offset)
  }

  const tokens = tokenize(scrubbed.text)
  if (tokens.length === 0) return fail(query, 'invalid', 'The query contains only comments.')

  let depth = 0
  for (const t of tokens) {
    if (t.value === '(') depth++
    if (t.value === ')' && --depth < 0) return fail(query, 'invalid', 'Unbalanced parenthesis: ")" without a matching "(".', t.position)
  }
  if (depth > 0) {
    const open = [...tokens].reverse().find(t => t.value === '(' && t.depth === depth - 1)
    return fail(query, 'invalid', 'Unbalanced parenthesis: "(" is never closed.', open?.position)
  }

  const semicolons = tokens.filter(t => t.value === ';')
  const extra = semicolons.find(s => tokens.some(t => t.position > s.position && t.value !== ';'))
  if (extra) {
    return fail(query, 'invalid', 'Only one statement can be run at a time.', extra.position,
      'Remove everything after the first ";" and run the statements one by one.')
  }

  const words = tokens.filter(t => t.value !== ';')
  const first = words[0]
  if (BLOCKED_LEADING[first.value]) return fail(query, 'blocked', BLOCKED_LEADING[first.value], first.position)

  for (let i = 0; i < words.length; i++) {
    const t = words[i]
    if (BLOCKED_ANYWHERE.has(t.value)) return fail(query, 'blocked', `${t.value} is not allowed.`, t.position)
    const fn = t.raw.toLowerCase()
    if (words[i + 1]?.value === '(' && (BLOCKED_FUNCTIONS.has(fn) || fn.startsWith('lo_'))) {
      return fail(query, 'blocked', `The function ${t.raw.toLowerCase()}() is not allowed.`, t.position)
    }
  }

  const writes = words.filter((t, i) => WRITE_KEYWORDS.has(t.value) && (t.value === 'INSERT' || t.value === 'MERGE' || isModifyingKeyword(words, i)))
  for (const w of writes) {
    const i = words.indexOf(w)
    if ((w.value === 'UPDATE' || w.value === 'DELETE') && !hasOwnWhere(words, i)) {
      return fail(query, 'blocked', `${w.value} without a WHERE clause would affect every row and is not allowed.`, w.position,
        'Add a WHERE clause that selects the rows to change.')
    }
  }
  if (writes.length > 0) {
    const protectedRef = words.find(t => PROTECTED_TABLES.has(t.raw.toLowerCase()))
    if (protectedRef) {
      return fail(query, 'blocked', `Statements that change data may not reference "${protectedRef.raw.toLowerCase()}".`,
        protectedRef.position, 'Users are managed on the Users page; the audit log and migration history are read-only.')
    }
    if (readOnly) {
      return fail(query, 'read_only', `${writes[0].value} modifies data, but the query runs in read-only mode.`, writes[0].position,
        'Untick "Read only" to allow data changes.')
    }
  }

  const end = semicolons[0]?.position ?? query.length
  return {
    ok: true,
    plan: {
      leading: first.value,
      cursorable: CURSOR_LEADING.has(first.value) && writes.length === 0,
      statement: query.slice(0, end),
    },
  }
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `\\x${value.toString('hex')}`
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(normalizeValue)
  return value
}

export class SqlConsoleError extends Error {
  constructor(public readonly body: SqlQueryError) { super(body.error) }
}

/**
 * Maps a PostgreSQL error to the console's error shape. `offset` is the number
 * of characters the console put in front of the user's statement.
 */
function fromPostgresError(query: string, err: any, offset = 0): SqlQueryError {
  const body: SqlQueryError = { kind: 'database', error: err?.message ?? 'Unknown database error.' }
  if (err?.code) body.pgCode = err.code
  if (err?.hint) body.hint = err.hint
  if (err?.detail) body.detail = err.detail
  const position = Number(err?.position) - offset
  if (Number.isFinite(position) && position > 0) {
    body.position = position
    Object.assign(body, lineAndColumn(query, position))
  }
  if (err?.code === '57014') {
    body.kind = 'timeout'
    body.error = `The query took longer than ${STATEMENT_TIMEOUT_MS / 1000} seconds and was cancelled.`
  }
  if (err?.code === '25006') {
    body.kind = 'read_only'
    body.hint = 'Untick "Read only" to allow data changes.'
  }
  return body
}

interface RawResult {
  command: string
  columns: { name: string; type: number }[]
  rows: Record<string, unknown>[]
  count: number
}

/**
 * Runs one validated statement in its own transaction, as SQL_CONSOLE_ROLE, with
 * a timeout. At most ROW_LIMIT + 1 rows are fetched, so a huge result never
 * reaches the API in full.
 */
export async function runSql(plan: SqlPlan, readOnly: boolean): Promise<SqlQueryResult> {
  const started = performance.now()
  const offset = plan.cursorable ? CURSOR_PREFIX.length : 0
  try {
    const raw = await sql.begin(readOnly ? 'read only' : 'read write', async (tx): Promise<RawResult> => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
      try {
        await tx.unsafe(`SET LOCAL ROLE ${SQL_CONSOLE_ROLE}`)
      } catch (err: any) {
        throw new SqlConsoleError({
          kind: 'unavailable',
          error: `The SQL console database role "${SQL_CONSOLE_ROLE}" is not set up (${err?.message ?? 'unknown error'}).`,
          hint: 'A database superuser must run migration 0012_sql_console_role.sql.',
          pgCode: err?.code,
        })
      }

      if (plan.cursorable) {
        await tx.unsafe(CURSOR_PREFIX + plan.statement)
        const rows: any = await tx.unsafe(`FETCH ${ROW_LIMIT + 1} FROM ${CURSOR_NAME}`)
        return { command: 'SELECT', columns: rows.columns ?? [], rows: Array.from(rows), count: rows.length }
      }

      if (DIRECT_LEADING.has(plan.leading)) {
        const rows: any = await tx.unsafe(plan.statement)
        return { command: rows.command ?? plan.leading, columns: rows.columns ?? [], rows: Array.from(rows), count: rows.length }
      }

      // Data changes: a protocol-level cursor stops fetching after the cap
      let first: any
      const rows: Record<string, unknown>[] = []
      for await (const batch of (tx.unsafe(plan.statement) as any).cursor(ROW_LIMIT + 1)) {
        first ??= batch
        rows.push(...batch)
        if (rows.length > ROW_LIMIT) break
      }
      return {
        command: first?.command ?? plan.leading,
        columns: first?.columns ?? [],
        rows,
        count: typeof first?.count === 'number' ? first.count : rows.length,
      }
    })

    const truncated = raw.rows.length > ROW_LIMIT
    return {
      command: raw.command,
      columns: raw.columns.map(c => ({ name: c.name, typeOid: c.type })),
      rows: raw.rows.slice(0, ROW_LIMIT).map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, normalizeValue(v)]))),
      rowCount: truncated ? ROW_LIMIT : raw.count,
      truncated,
      durationMs: Math.round(performance.now() - started),
    }
  } catch (err) {
    if (err instanceof SqlConsoleError) throw err
    throw new SqlConsoleError(fromPostgresError(plan.statement, err, offset))
  }
}
