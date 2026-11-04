# ADR-027: Admin dialogs use one native `<dialog>` primitive; content items and groups are created and edited in a modal

- **Status:** Proposed
- **Date:** 2026-11-03
- **Related:** ADR-002 (group management on the Content page; amended by this ADR for its two forms)
- **Implements:** FR-108, FR-110, FR-111, FR-113, FR-114

## Context
The admin has four hand-rolled overlays (`fixed inset-0 z-50` divs) without focus trapping, scroll lock or focus return, and the content create/edit form renders inline in the list, where it scrolls away, competes with drag-and-drop and can be closed with unsaved input. Spec 09 needs a modal create/edit form, a phone navigation drawer and a media picker that opens on top of the form, all accessible.

## Options Considered
1. **Native `<dialog>` with `showModal()` wrapped in one React primitive.** Top layer (no z-index conflicts with the sidebar, FAB or toasts' stacking), built-in inertness of the background and focus containment, `cancel` event for `Esc`. Needs small additions: scroll lock, focus return, backdrop-click detection, veto of `cancel`, and toasts portalled into the top dialog because the top layer covers fixed elements. Supported by every browser the admin targets.
2. **Hand-rolled div overlay + `inert` on the app root.** Full control, but focus trap, stacking and `Esc` ordering have to be written and tested by hand; z-index must be managed against every other fixed element.
3. **A headless UI library (Radix Dialog, Headless UI).** Mature accessibility, but a new dependency and styling layer for four or five dialogs.
4. **Keep inline forms; only add an unsaved-changes guard.** Least work; does not meet the request that the page be blocked until the form is dismissed.

## Decision
Option 1. `packages/app/src/admin/components/ui/Dialog.tsx` is the only way to build an admin modal; new admin overlays use it. Content items and groups are created and edited in dialogs whose open state is in the URL (`?new=1`, `?edit=<id>`, `?newGroup=1`, `?editGroup=<id>`). Dismissing a dialog with unsaved input always asks first, and while a form is dirty the admin guards reloads and tab closes with `beforeunload` and in-app navigation with its own confirmation (BR-060); because the app uses `<BrowserRouter>`, the in-app guard is an admin-level provider rather than react-router's `useBlocker`. While a form dialog is open nothing else on the admin page can be used. Group management stays on the Content page (ADR-002); only its forms move into dialogs.

## Consequences
- One tested place for dialog accessibility; nested dialogs (media library over the content form) work by construction.
- Toasts must render inside the top open dialog while one is open.
- Cypress tests interact with `dialog[open]`; the background is inert, so tests can no longer click page controls while a dialog is open.
- `beforeunload` text cannot be customised: browsers show their own generic warning.
- Follow-ups: migrate `ItemDailyModal` and `SqlConfirmModal` onto the primitive; if the app moves to a data router, replace the location-change guard with `useBlocker`.
