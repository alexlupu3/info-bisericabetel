// Bounded registry of remote MCP sessions (Streamable HTTP transports, ADR-015).
//
// Clients that never send DELETE /mcp would otherwise keep their transport (and its
// McpServer) in memory until the process restarts. A session is dropped and closed
// when it has been idle for `idleTtlMs`, when it is older than `maxAgeMs`, or when a
// new session needs room beyond `maxSessions` (the least recently used one goes).
// A closed session's next request gets "Unknown or expired session" and the client
// initialises a new one.

export interface ClosableSession {
  close(): Promise<void>
}

export interface SessionLimits {
  idleTtlMs: number
  maxAgeMs: number
  maxSessions: number
}

/** Production limits: a client polling at least every 30 min keeps its session for up to a day. */
export const MCP_SESSION_LIMITS: SessionLimits = {
  idleTtlMs: 30 * 60_000,
  maxAgeMs: 24 * 60 * 60_000,
  maxSessions: 50,
}

interface Entry<T> { session: T; createdAt: number; lastSeen: number }

export class SessionRegistry<T extends ClosableSession> {
  // Map iteration order is insertion order; touch() re-inserts, so the first entry
  // is always the least recently used one.
  private readonly entries = new Map<string, Entry<T>>()

  constructor(private readonly limits: SessionLimits, private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.entries.size
  }

  /** The live session for `id`, marked as used; undefined when unknown or expired (it is closed). */
  get(id: string): T | undefined {
    const entry = this.entries.get(id)
    if (!entry) return undefined
    const t = this.now()
    if (this.expired(entry, t)) {
      this.evict(id, entry)
      return undefined
    }
    entry.lastSeen = t
    this.entries.delete(id)
    this.entries.set(id, entry)
    return entry.session
  }

  /** Registers a new session, first expiring stale ones and evicting the LRU one when full. */
  add(id: string, session: T): void {
    this.sweep()
    while (this.entries.size >= this.limits.maxSessions) {
      const [oldestId, oldest] = this.entries.entries().next().value as [string, Entry<T>]
      this.evict(oldestId, oldest)
    }
    const t = this.now()
    this.entries.set(id, { session, createdAt: t, lastSeen: t })
  }

  /** Forgets `id` without closing it (the transport's own onclose / DELETE path). */
  delete(id: string): void {
    this.entries.delete(id)
  }

  /** Closes and forgets every expired session; returns how many were dropped. */
  sweep(): number {
    const t = this.now()
    let dropped = 0
    for (const [id, entry] of [...this.entries]) {
      if (this.expired(entry, t)) {
        this.evict(id, entry)
        dropped++
      }
    }
    return dropped
  }

  /** Closes every session (server shutdown). */
  closeAll(): void {
    for (const [id, entry] of [...this.entries]) this.evict(id, entry)
  }

  private expired(entry: Entry<T>, t: number): boolean {
    return t - entry.lastSeen > this.limits.idleTtlMs || t - entry.createdAt > this.limits.maxAgeMs
  }

  private evict(id: string, entry: Entry<T>): void {
    this.entries.delete(id)
    // Closing ends any open SSE stream; a failure must not break the caller's request.
    entry.session.close().catch(() => {})
  }
}
