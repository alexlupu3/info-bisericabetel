# Security

## Security Baseline
- Authentication requirements:
- Authorization requirements:
- Sensitive data handling:
- Secret management approach:

## Super-Admin Password Reset (Implemented — 2026-03-21)

`POST /admin/users/:id/reset-password` allows a super-admin to reset the password of any `admin`-role account.

**Authorization:** restricted to `superAdminOnly` via the existing preHandler. Super-admin accounts cannot be targeted — the endpoint returns HTTP 400 if the target user has `role !== 'admin'`. This prevents privilege escalation.

**Password generation:** a 10-character alphanumeric temporary password is generated using the same method as user creation. It is hashed with bcryptjs (salt rounds: 12) before being stored. The plaintext is returned once in the response body (`{ tempPassword }`) for the super-admin to communicate out-of-band. It is never logged or stored in plaintext.

**Forced change:** `must_change_password` is set to `true` so the affected admin is required to change their password on next login.

**Audit logging:** every reset is written to the audit log with `action: 'reset_password'`, `entityType: 'user'`, and `detail.targetEmail`.

**No email sent:** at this stage the temporary password is shown in the admin UI only. Email delivery is planned (FR-031 — see section below and `docs/architecture/integrations.md`).

## Password Reset Tokens (Planned — FR-031)

When FR-031 (self-service password reset) is implemented, the following design must be followed:

- A new `password_reset_tokens` table stores each reset request: `id` (UUID), `userId` (FK to admin users), `token` (random, high-entropy string), `expiresAt` (timestamp).
- Tokens must be short-lived. Recommended TTL: 1 hour.
- The token stored in the database must be hashed (e.g. SHA-256) — only the hash is persisted, the raw token is sent once via email and never stored in plaintext.
- A token is single-use: it must be invalidated immediately upon successful password reset.
- The `POST /auth/forgot-password` endpoint must respond with a generic success message regardless of whether the email address is registered, to avoid user enumeration.
- The `POST /auth/reset-password` endpoint must verify token existence, hash match, and expiry before accepting a new password.

## Compliance and Risk
- Regulatory considerations:
- Audit requirements:
- Incident concerns:
