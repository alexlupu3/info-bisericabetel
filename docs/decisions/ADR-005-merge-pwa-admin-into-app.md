# ADR-005: Merge packages/pwa and packages/admin into packages/app

## Status
Accepted

## Date
2026-04-06

## Context

The project previously maintained two separate frontend packages:

- `packages/pwa` — the public-facing Progressive Web App (served at `/`)
- `packages/admin` — the admin SPA (served at `/admin`, separate Vite dev server on port 5174)

Both packages used an identical technology stack (React, TypeScript, Vite, TanStack Query, React Router). They were built independently, rsynced to separate web root directories on the server (`/var/www/pwa` and `/var/www/admin`), and served by Nginx from two separate `location` blocks.

This structure imposed maintenance overhead: two `package.json` files, two Vite configs, two deploy pipeline stages, and two separate Nginx location blocks to keep in sync. The original rationale for separation was bundle isolation — the architecture constraint stated "must not share build artifacts with the public PWA." However, this constraint was about runtime isolation (public users should not download admin JS), not physical package separation.

## Options Considered

1. **Keep two packages** — no change; maintain two Vite configs, two deploy stages, two Nginx locations.
2. **Merge into a single package with a mono-entry Vite build** — one package, one build, one Nginx location. Admin routes loaded eagerly alongside public routes.
3. **Merge into a single package with `React.lazy` code splitting** — one package, one build, but admin JS produced as a separate lazy chunk. Public users only download the admin chunk if they navigate to `/admin/*`.

## Decision

Adopt option 3: merge into `packages/app` with React.lazy code splitting.

`App.tsx` defines a unified router. Public routes (`/`, `/:siteSlug`) are eager. The admin surface is loaded via:

```tsx
const AdminApp = React.lazy(() => import('./admin/AdminApp'))
```

The Vite build produces a separate `AdminApp-[hash].js` chunk. Public users never trigger its download. This satisfies the original bundle isolation intent while eliminating the overhead of two separate packages.

### Structural changes

- `packages/app/src/main.tsx` — single `QueryClientProvider` (staleTime: 60s, retry: 1) + `BrowserRouter` at root.
- `packages/app/src/App.tsx` — unified router; public routes eager, admin routes lazy behind `React.Suspense`.
- `packages/app/src/public/` — all sources from former `packages/pwa/src/` (api, components, context, hooks, pages).
- `packages/app/src/admin/AdminApp.tsx` — adapted from former `packages/admin/src/App.tsx`; `BrowserRouter` and `basename="/admin"` removed (routing handled by the outer router), `QueryClientProvider` removed (provided at root), wrapped in `<div className="admin-theme">`.
- `packages/app/src/admin/` — all other admin sources (api/client.ts, context/AuthContext.tsx, context/ToastContext.tsx, pages/).
- `packages/app/src/index.css` — merged CSS: PWA design token system (with light/dark toggle) + `.admin-theme` class setting admin-specific CSS vars (dark theme, orange accent).

### Admin theme scoping

The `.admin-theme` wrapper class confines admin CSS custom properties to the admin subtree. This prevents style leakage: the admin's dark-by-default background and orange accent do not bleed into the public PWA, and vice versa.

### PWA service worker

The Vite PWA plugin config preserves `navigateFallbackDenylist: [/^\/admin/]`. The service worker does not intercept admin routes. PWA installability is unaffected.

### Nginx

Nginx was simplified from two `location` blocks to a single `location /` serving `/var/www/app`.

### Cypress tests

All admin test files updated from `ADMIN_URL = 'http://localhost:5174/admin/'` to `ADMIN_URL = '/admin/'` (relative URL), as both surfaces are now served from the same Vite dev server on port 5173.

## Consequences

- **Supersedes:** the "must not share build artifacts" constraint in the architecture overview. That constraint is now satisfied by lazy loading rather than package separation. See `docs/architecture/overview.md`.
- **Eliminated:** `packages/pwa/`, `packages/admin/`, `dev:admin` root script, `deploy:pwa`, `deploy:admin` root scripts.
- **Added:** `packages/app/`, `deploy:app` root script.
- **Reduced build pipeline:** one Vite build instead of two; one rsync target instead of two.
- **Dev workflow simplified:** `pnpm dev` starts a single server at `http://localhost:5173` serving both surfaces.
- **Known limitation:** because both surfaces share a single `index.html` entry, there is no separate admin-only cache-busting strategy. A cache-busted admin deploy also re-deploys the public PWA and vice versa. This is acceptable given the manual deploy model.
