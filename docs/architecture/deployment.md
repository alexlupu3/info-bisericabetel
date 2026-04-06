# Deployment

## Target Server

- **OS:** Ubuntu 24.04 LTS
- **Reverse proxy:** Nginx, ports 80 and 443. TLS via certbot (auto-renewed).
- **Container runtime:** none — services run natively under systemd.
- **Database:** PostgreSQL 16, bound to localhost only
- **Firewall:** inbound open on 22 (SSH), 80 (HTTP), 443 (HTTPS) only
- **Process manager:** systemd manages all services

## Deployment Method

- Build artifacts are rsynced to a staging area on the server
- A deploy tool promotes staging → web root for frontend packages
- `.env` files must be present in the staging area before deploy
- Deployments are manual — no CI/CD pipeline configured

## Implications for This Project

- **No Docker:** the backend API runs as a native systemd service. Nginx reverse-proxies to it.
- **PostgreSQL 16 available:** primary database engine.
- **Unified frontend package:** `packages/app` builds a single Vite output that serves both the public PWA (at `/`) and the admin tool (at `/admin/*`). Build artifact is written to `packages/app/dist/` and served from `/var/www/app` on the server.
- **Nginx:** a single `location /` block serves `/var/www/app`. There are no separate location blocks for the public PWA and admin tool.
- **Admin dev server:** the admin tool is no longer a separate dev server. `pnpm dev` starts a single Vite dev server at `http://localhost:5173`; both the public PWA (`/`) and admin (`/admin`) are available there.
- **Backend API:** runs as a native systemd service; Nginx reverse-proxies to it.

## Environments

- **Local:** developer machine
- **Staging:** not yet configured on the server
- **Production:** VPS as described above
