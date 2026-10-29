// Errors thrown by services and mapped to HTTP statuses by REST handlers and to
// tool errors by the remote MCP endpoint (spec 05 §6.6). Messages are user-facing
// and identical on every surface.

export class ServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = new.target.name
  }
}

/** Bad input (label, site slug, filter value, …) → 400. */
export class ValidationError extends ServiceError {
  constructor(message: string) { super(message, 400) }
}

/** Invalid analytics date range or `tz` (spec 05 §6.8) → 400. */
export class InvalidRangeError extends ValidationError {}

/** Unknown or soft-deleted entity → 404. */
export class NotFoundError extends ServiceError {
  constructor(message: string) { super(message, 404) }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError
}

/** Fastify helper: sends `{ error }` with the error's status, or rethrows anything else. */
export function sendServiceError(reply: { code(status: number): { send(body: unknown): unknown } }, e: unknown): unknown {
  if (isServiceError(e)) return reply.code(e.status).send({ error: e.message })
  throw e
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a UUID string; used before querying uuid columns so bad ids are 404s, not 500s. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
