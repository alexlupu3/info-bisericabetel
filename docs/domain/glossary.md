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
| Locale | A BCP-47 language code (e.g. `ro`, `en`) identifying the language used for public hub display | Romanian (`ro`) is the default; additional locales are managed by super-admins |
| Default locale | The canonical language (Romanian, `ro`) in which all content is originally authored | Always available; used as fallback when a translation is missing for any other locale |
| Translation key | A dot-notation string (e.g. `nav.viewAll`) identifying a UI string that can be translated | Managed in the admin Translations page; source values are defined in code |
| LanguageSwitcher | The UI toggle in the public hub footer that allows users to switch the display language | Preference is persisted in localStorage under the key `betel-lang` |
| Translation status badge | An indicator shown on admin content list items when translations are missing or incomplete for one or more enabled non-default languages | Visible in the admin content list; not shown on the public hub |
| Short link | A short URL in the form `/s/<code>` that redirects to a content item's destination URL and logs the click server-side | Created by admins; each short link has a label identifying the distribution channel (e.g. "WhatsApp Manastur") |
| Distribution channel | An admin-assigned label on a short link identifying how or where the link was shared (e.g. "QR cod intrare", "WhatsApp Manastur") | Used to distinguish traffic sources for the same content item in analytics |
