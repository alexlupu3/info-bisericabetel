# Domain Glossary

Define business and ministry terms exactly once and reuse them consistently.

| Term | Definition | Notes |
| --- | --- | --- |
| Biserica Baptista Betel - Cluj-Napoca | The church organization this application serves | Referred to as the church when context is clear |
| Church information hub | The application being built to centralize useful information for members | Primary product description |
| Multi-site church | A single church organization operating across multiple sites | Requires content filtering and cross-site visibility |
| Site | One local campus or location within the wider church organization | Users may prefer content scoped to their site |
| All-sites view | A view that shows content from all church sites | Must remain available even when filtering exists |
| Bookmarked links | Curated links that the church wants members to access quickly | May point to internal or external resources |
| Poster | A content type composed of an image and an optional admin-only `name` label; rendered as a visual image tile on the public hub | The `name` field is stored in `data.name` (JSONB), admin-only, never displayed publicly |
| Media library | The admin UI and underlying `media` table that tracks all uploaded images, shows which content items use each image, and allows deletion of unused images | Accessible via the `/media` admin route; see ADR-003 |
| Orphan (media) | An image file present on disk that has no corresponding row in the `media` table | Can occur only if the DB insert fails after a successful file write during upload |
