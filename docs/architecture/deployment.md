# Deployment

## Target Server — cloudlab VPS
- **OS:** Ubuntu 24.04.4 LTS (kernel 6.8.0-101-generic), KVM/QEMU virtualisation
- **RAM:** 7.8 GiB total (~600 MiB in use). No swap configured — memory-intensive runtimes need care.
- **Disk:** 96 GB total (~2.6 GB used)
- **Reverse proxy:** Nginx 1.24, ports 80 and 443. Wildcard TLS cert at `alexlupu.dev` via certbot (auto-renewed). New projects get a subdomain: `<project>.alexlupu.dev`
- **Container runtime:** none (no Docker or Podman installed)
- **Process manager:** systemd manages all services. PHP-FPM 8.3 is present for existing projects.
- **Database:** PostgreSQL 16, already installed, bound to `127.0.0.1:5432` (local only)
- **Firewall:** UFW, inbound open on 22 (SSH), 80 (HTTP), 443 (HTTPS) only

## Deployment Method
- Files staged at `/opt/kevin/staging/<project>/` (writable by `kevin` user)
- `kevin project-deploy <project>` rsyncs staging → `/var/www/<project>/public/`, owned by `www-data:www-data`
- `.env` files must be present in staging before deploy
- Deployments are manual — no CI/CD pipeline configured

## Implications for This Project
- **No Docker:** the backend API must run as a native systemd service. Nginx will reverse-proxy to it.
- **PostgreSQL 16 available:** the project should use PostgreSQL as the primary database engine. The ORM/connector must support it.
- **No swap:** the chosen backend runtime must be reasonably memory-efficient.
- **Subdomain:** the app will likely be served at `info-bisericabetel.alexlupu.dev` or a custom domain pointed to the same server.
- **Public PWA:** build output served statically by Nginx from `/var/www/<project>/public/`.
- **Admin tool:** separate build with its own entry point. Can be served from the same Nginx config under a distinct path (e.g. `/admin`) or a subdomain — implementation decision. Must not share JS/CSS bundles with the public PWA.
- **Backend API:** runs as a native systemd service; Nginx reverse-proxies to it.

## Environments
- **Local:** developer machine, details TBD per stack choice
- **Staging:** not yet configured on the server
- **Production:** cloudlab VPS as described above

## Open Gap
- CPU core count not confirmed — Kevin can run a live server-check to confirm when needed.
