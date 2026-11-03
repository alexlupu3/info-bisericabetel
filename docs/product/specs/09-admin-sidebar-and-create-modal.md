# Spec 09 — Admin sidebar navigation and content create/edit dialog

- **Owner area:** admin shell (navigation, floating layers, dialog primitive) and the Content page create/edit flow (see [README.md](README.md))
- **FR range:** FR-105 – FR-114
- **BR range:** BR-060 (BR-061 – BR-064 reserved, unused)
- **ADR:** ADR-027 (admin dialogs: one native-`<dialog>` primitive; content items are created and edited in a modal) — *Proposed*, full text in §12
- **Migration:** none
- **Mockup:** [interactive mockup](https://claude.ai/artifact/NwtdX3FZomdWh7UowRaayG) (role switch super-admin / admin, desktop sidebar expanded / rail, phone FAB drawer, "Element nou" dialog with the unsaved-changes confirmation)
- **Status:** Ready for implementation, 2026-11-03 (open questions resolved with the product owner, see §11)

## 1. Summary

The admin top bar holds up to ten uppercase links for a super-admin (Conținut, Locații, Media, Arhivă, Statistici, Utilizatori, Jurnale, Erori, Traduceri, SQL) plus the theme toggle and "Ieșire"; spec 01 adds an eleventh ("Aplicație"). It no longer fits on one line at common laptop widths, it gives every link the same weight, and on phones it becomes a hamburger dropdown that pushes the page down. Separately, "+ Adaugă" opens the create form inline at the top of the Content page, where it scrolls away with the list, competes with drag-and-drop and context menus, and is easy to lose with unsaved input; editing opens a second inline form under the row.

This spec replaces the top bar with a **grouped, role-aware sidebar** (expanded or icon rail on desktop, remembered per device; an off-canvas drawer opened by a **floating action button** at the bottom right on phones) and moves content **create and edit into a true modal dialog** built on one accessible dialog primitive: focus trapped, background inert and scroll-locked, `Esc`/backdrop dismissal that never silently discards unsaved input, a full-screen sheet on phones, and a clear landing after save (dialog closes, the new item is scrolled into view, highlighted and focused).

Regular admins see a short flat menu (four pages); super-admins see the same four plus two labelled groups. No permission changes: the menu mirrors today's page-level route guard. (The API allows a little more than the pages expose: `admin` may read languages and UI translations, but the Traduceri page stays super-admin only.)

## 2. Goals / Non-goals

**Goals**
- G1. One navigation surface for every admin page, grouped by purpose, readable at a glance, with a clear active state.
- G2. Regular admins see only what they can use, without group headings or system tools.
- G3. Desktop users can collapse the sidebar to an icon rail to give the Content page more room; the choice survives reloads on that device.
- G4. Phones get the navigation from a thumb-reachable FAB, without a header menu that shifts the page.
- G5. Creating (and, by default, editing) a content item happens in a modal dialog that must be finished or dismissed before anything else on the page can be used, and never loses typed input without asking.
- G6. One reusable, accessible dialog primitive for the admin, used by the content dialog and by the media library picker nested inside it.

**Non-goals**
- No change to roles, permissions, admin API routes or the database. Traduceri stays super-admin in the UI (FR-041), although the API allows read-only access for `admin`.
- No site switcher in the admin. The admin has no "current site" today (the Content page lists all sites' items; Statistici has its own site filter, `components/analytics/SiteFilter.tsx`); adding one is a separate feature.
- No change to the public hub (`/`, `/:siteSlug`, `/i/:itemId`), its header, footer or the PWA install invite (spec 01, public only).
- "+ Grup nou" and the group edit panel stay inline (ADR-002); see D-4.
- No draft persistence of a half-filled dialog across reloads (D-6).
- No redesign of the content form's fields; they move into the dialog as they are (the dates row of spec 04 and the location input of spec 07 included).
- The orphan `/admin/groups` route (ADR-002) is not touched; removing it is a follow-up.

## 3. Current state

| Area | Today | Where |
|---|---|---|
| Admin shell | `Shell()` renders a top `<nav>`: brand "BETEL ADMIN", inline `NavLink`s (`hidden md:flex`), theme toggle (`data-testid="admin-theme-toggle"`), "Ieșire". Below `md` a hamburger (`hamburger-btn`) toggles a dropdown (`mobile-menu`) that repeats every link. Links are duplicated in both lists, each guarded by `user.role === 'super-admin'` | `packages/app/src/admin/AdminApp.tsx` lines 62–186 |
| Routes | `content`, `groups` (not linked, ADR-002), `media`, `archive`, `analytics` for every signed-in user; `locations`, `users`, `logs`, `error-logs`, `translations`, `sql` only rendered for `super-admin` (otherwise the `*` route redirects to `content`). Most pages sit in `PageContainer` (`max-w-[900px]`); `logs`, `error-logs`, `sql` are full width | `AdminApp.tsx` lines 167–183 |
| Roles | `users.role` is `admin` (default) or `super-admin`. admin or super-admin: content, groups, media, short links, analytics, read-only languages/translations; super-admin only: users, sites, logs, error logs, translations write, SQL | `packages/api/src/db/schema.ts` line 35; `docs/architecture/security.md` → Roles |
| Planned nav item | Spec 01 adds `/admin/pwa`, super-admin only, nav label "Aplicație" | `docs/product/specs/01-pwa.md` FR-053 |
| Create flow | "+ Adaugă" (`create-content-btn`) sets `creating`; `<ContentForm>` renders inline at the top of the page (`data-testid="create-form"`). "Adaugă conținut în grup" (`group-add-content-<id>`) sets `creatingInGroup` and renders a second inline `ContentForm` with `defaultGroupId`; after save the group is re-sorted chronologically (user-flows Flow 3) | `packages/app/src/admin/pages/ContentPage.tsx` lines 210–221, 536–571 |
| Edit flow | Clicking an item name or "Editează" in its context menu sets `editing`; the same `ContentForm` renders inline under the row or inside the group block (`data-testid="edit-form"`) with tabs "Editează" / "Linkuri scurte" (`tab-edit`, `tab-short-links`) and the translation locale select; an effect scrolls it into view | `ContentPage.tsx` lines 213–221, 586–612, 803–810, 1457–1915 |
| Form state | `ContentForm` owns `form`, `transLocale`, `transForm`, `busy`, `error`; "Anulează" calls `onClose` with no unsaved-changes check; save shows a toast ("Element creat" / "Salvat" / "Traducere salvată") and calls `onSaved` | `ContentPage.tsx` lines 1457–1535, 1880–1912 |
| Existing modals | Hand-rolled `fixed inset-0 … z-50` overlays without focus trap or scroll lock: `MediaLibraryModal` (opened from inside `ContentForm`'s image picker, so it will be a dialog on top of a dialog), `ItemDailyModal`, `SqlConfirmModal` (has `Esc` and initial focus) | `ContentPage.tsx` lines 1205–1245; `components/analytics/ItemDailyModal.tsx`; `components/sql/SqlConfirmModal.tsx` |
| Floating controls | Only the toast stack: `fixed bottom-5 right-5 z-50` (`toast-container`). No other fixed bottom control exists in the admin | `packages/app/src/admin/context/ToastContext.tsx` line 25 |
| Theme | Admin tokens under `:root.admin-theme` (light/dark, `--accent`, `--surface`, `--surface-2`, …); toggle in the top bar (FR-095) | `packages/app/src/index.css` lines 68–119 |

## 4. User flows

### 4.1 Regular admin, desktop
1. Signs in and lands on `/admin/content`. The left sidebar shows the brand, then four links with icons — **Conținut**, **Media**, **Arhivă**, **Statistici** — without group headings, and in the footer their email with an "Admin" pill, **Hub-ul public** (opens `/` in a new tab), the theme toggle and **Ieșire**.
2. The current page's link is bold, carries `aria-current="page"` and a thin accent bar.
3. Clicks the collapse button in the sidebar header: the sidebar becomes a 64 px icon rail; hovering or focusing an icon shows its label as a tooltip. After a reload the rail is still collapsed (same browser).

### 4.2 Super-admin, desktop
Same as 4.1, but the menu shows four labelled groups: **Conținut** (Conținut, Media, Arhivă), **Rapoarte** (Statistici), **Administrare** (Locații, Utilizatori, Traduceri, and Aplicație once spec 01 ships), **Sistem** (Jurnale, Erori, SQL). In the rail, group headings become thin dividers. The footer pill reads "Super-admin" in the accent colour.

### 4.3 Any admin, phone (< 768 px)
1. The page shows a slim header (brand + current page name) and a round black FAB with a menu icon at the bottom right.
2. Tapping the FAB slides a drawer in from the right (next to the thumb) over a dimmed backdrop; the FAB turns into a close (×) button and stays on top; focus moves to the current page's link.
3. Tapping a link navigates and closes the drawer; `Esc`, the backdrop, the × (drawn where the FAB is) or the browser Back button also close it. Focus is moved to the FAB.
4. A toast ("Element creat") appears above the FAB, never under it.

### 4.4 Creating an item
1. On Conținut the admin clicks **+ Adaugă** (or **Adaugă conținut în grup** on a group header). A dialog titled **Element nou** opens over a dimmed, non-scrolling page; the URL gains `?new=1` (`&group=<groupId>` from a group header, which preselects the group). Focus lands in the first field (Tip).
2. On a phone the dialog is a full-screen sheet with a sticky header (title, ×) and a sticky footer (**Anulează**, **Creează**).
3. The image picker's "Alege din bibliotecă" opens the media library as a second dialog on top; `Esc` closes only the library.
4. **Creează** saves. On success the dialog closes, the toast says "Element creat", the list shows the new item — its group is expanded and chronologically re-sorted when it was created in a group (as today) — scrolled into view, highlighted for about 2.5 s and focused (its name button). On a validation or server error the dialog stays open with the message inline and nothing is lost.
5. Dismissing: with nothing changed, `Esc`, the backdrop, × or **Anulează** close at once. With unsaved changes any of them shows an in-dialog confirmation — **Renunți la modificări?** "Ai modificări nesalvate. Dacă închizi, se pierd." — with **Continuă editarea** (focused) and **Renunță**. Browser Back behaves the same; closing or reloading the tab triggers the browser's own leave-page warning.
6. A pasted or reloaded `/admin/content?new=1` opens an empty create dialog.

### 4.5 Editing an item
Clicking an item's name or **Editează** in its menu opens the same dialog titled **Editează element** with the item title as context line and the existing tabs (**Editează**, **Linkuri scurte**) and translation locale select; URL `?edit=<itemId>`. Saving closes the dialog and highlights the row. A link to an item that no longer exists strips the parameter and shows the toast "Elementul nu mai există".

## 5. Requirements

- **FR-105 — Sidebar navigation.** At viewports ≥ 768 px the admin shell renders a left sidebar instead of the top navigation bar: a header (brand "BETEL ADMIN" and the collapse button), a `<nav aria-label="Navigare admin">` with the page links, and a footer with the signed-in user's email and role pill, a "Hub-ul public" link (`/`, new tab, `rel="noopener"`), the theme toggle (FR-095, `data-testid="admin-theme-toggle"` kept) and "Ieșire". The sidebar is sticky and full viewport height; the page itself keeps document scrolling (the shell grows with long pages, as asserted by `admin-theme.cy.ts`). The active page's link has `aria-current="page"` and a visual state that does not rely on colour alone (bold weight + accent bar). The shell's root wrapper carries `data-testid="admin-shell"`. The old top bar, hamburger and dropdown are removed. Acceptance: on a 1280 px viewport no top navigation exists, every page in the role's menu is reachable from the sidebar, and the link of the current route is marked current.
- **FR-106 — Role-based menu from one source.** The menu is defined once in `packages/app/src/admin/navigation.ts` as ordered groups of items `{ id, path, label, icon, superAdminOnly }`; the sidebar, the phone drawer and the super-admin route guard in `AdminApp.tsx` all read it, so a page is linked if and only if its route is rendered for that role (the security note in §12.4). Regular admins see Conținut, Media, Arhivă, Statistici as one flat list without group headings; super-admins see the groups Conținut (Conținut, Media, Arhivă), Rapoarte (Statistici), Administrare (Locații, Utilizatori, Traduceri), Sistem (Jurnale, Erori, SQL). Spec 01 appends `{ id: 'pwa', path: 'pwa', label: 'Aplicație', superAdminOnly: true }` to Administrare. Each link has `data-testid="nav-<id>"`. Acceptance: as `admin`, `nav-locations`, `nav-users`, `nav-translations`, `nav-logs`, `nav-error-logs`, `nav-sql` do not exist and no group heading is rendered; as `super-admin` all ten links exist under four headings.
- **FR-107 — Collapsible rail with a remembered preference.** At ≥ 768 px the sidebar is either expanded (240 px, icon + label) or a rail (64 px, icon only). The collapse button (`data-testid="sidebar-collapse"`) has `aria-controls` pointing at the sidebar, `aria-expanded` reflecting the state and the label "Restrânge meniul" / "Extinde meniul". The choice is stored in `localStorage` key `betel-admin-sidebar` (`expanded` | `collapsed`, read and written in `try/catch`); without a stored value the sidebar is expanded at ≥ 1024 px and a rail from 768 to 1023 px. In the rail every link keeps its accessible name (visually hidden label) and shows a tooltip with the label on hover and on keyboard focus; group headings render as dividers and the footer shows icons only. No single-key keyboard shortcut is added (WCAG 2.1.4). Acceptance: collapsing, reloading and revisiting keeps the rail; each rail link still has the page name as its accessible name.
- **FR-108 — Phone drawer opened by a floating action button.** Below 768 px the shell renders a slim header (brand + current page label) and, instead of the sidebar, a FAB (`data-testid="nav-fab"`, 56 × 56 px, bottom-right, offset `1rem` plus the safe-area insets) labelled "Deschide meniul" / "Închide meniul", with `aria-expanded` and `aria-controls`. It opens a drawer (`data-testid="nav-drawer"`) from the right edge, max 320 px / 84 % wide, built on the dialog primitive (FR-110) with `aria-label="Meniu admin"`, containing the same menu and footer as the sidebar. Because the drawer lives in the top layer, the FAB itself cannot sit above it: the drawer renders its own close button (`data-testid="nav-drawer-close"`, ×, "Închide meniul") at exactly the FAB's position, so to the user the FAB turns into ×. The drawer closes on link activation, `Esc`, backdrop, that × and browser Back (no history entry is created for the drawer: Back closes it by handling the route change), and focus returns to the FAB. The FAB is hidden while any modal dialog is open. Acceptance: at 375 × 812 the FAB is visible, the drawer opens with focus on the current link, a link click navigates and closes it, and `Esc` returns focus to the FAB.
- **FR-109 — Floating layers do not collide.** One z-index scale, defined as CSS custom properties in `index.css` under `:root.admin-theme` and used by every admin overlay: sidebar `--z-sidebar: 30`, FAB `--z-fab: 40`, toasts `--z-toast: 70` (dialogs and the drawer use the browser's top layer and need no z-index). Below 768 px the toast stack sits above the FAB (`bottom: calc(5.5rem + env(safe-area-inset-bottom))`, full width minus 1 rem gutters, right-aligned) and pages get enough bottom padding (`pb-28`) that the FAB never covers the last row or its context menu. While a dialog is open toasts render inside the top dialog (FR-110) so they are not hidden behind the backdrop. Acceptance: at 375 px a toast and the FAB do not overlap (bounding boxes are disjoint) and the last content row's menu trigger is clickable after scrolling to the bottom.
- **FR-110 — Accessible dialog primitive.** `packages/app/src/admin/components/ui/Dialog.tsx` wraps a native `<dialog>` opened with `showModal()` (ADR-027) and guarantees: `aria-modal="true"`, `aria-labelledby` its visible title (and `aria-describedby` when a description is given); initial focus on a chosen element (default: the first field, never the close button); focus trapped by the top layer; the rest of the app inert; document scroll locked while any dialog is open (`overflow: hidden` on `<html>`, with scrollbar-gutter compensation) and restored after the last one closes; focus returned to the element that opened it (or to a caller-provided target); `Esc` and backdrop clicks routed to an `onRequestClose` callback that the caller may veto (the native `cancel` event is prevented and re-dispatched); a backdrop click counts only when the pointer both went down and up on the backdrop (a text-selection drag from a field must not close it); stacked dialogs handle `Esc` only in the topmost one; reduced-motion users get no transition. Two layouts: `centered` (max width 640 px, or 720 px for the edit layout; max height `calc(100dvh - 3rem)`, body scrolls, header and footer fixed) and, below 768 px, `sheet` (full screen, `100dvh`, sticky header with × and sticky footer, safe-area padding). A toast outlet is provided inside the dialog for FR-109. `MediaLibraryModal` moves onto this primitive. Acceptance: with the create dialog open, `Tab`/`Shift+Tab` never reach the page behind it, the page does not scroll with the wheel, and closing returns focus to "+ Adaugă".
- **FR-111 — Create content in a modal dialog.** "+ Adaugă" and "Adaugă conținut în grup" open the content dialog (`data-testid="content-dialog"`, title "Element nou") containing the existing create form (`data-testid="create-form"` and all field test ids unchanged) instead of rendering it inline; the group header action preselects the group. Dismissal rules (BR-060): with the form unchanged since opening, `Esc`, backdrop, × (`data-testid="content-dialog-close"`) and "Anulează" close immediately; with changes, each of them opens an in-dialog confirmation (`role="alertdialog"`, `data-testid="discard-confirm"`, title "Renunți la modificări?", buttons "Continuă editarea" — focused — and "Renunță", `data-testid="discard-confirm-keep"` / `discard-confirm-discard`); `Esc` inside the confirmation means "Continuă editarea". "Changed" means the current form value differs from the initial one (a field typed and reverted is not a change). While a save is in flight every dismissal path is disabled and the submit button shows "Se salvează…". While the dialog is dirty a `beforeunload` handler asks before the tab is closed or reloaded. Acceptance: typing a title then pressing `Esc` shows the confirmation; "Continuă editarea" keeps the typed title; "Renunță" closes without an API call; `Esc` on an untouched form closes at once.
- **FR-112 — Landing after save.** After a successful create the dialog closes, `['admin-content']` is invalidated, the toast "Element creat" is shown, and once the refreshed list contains the new item: its group is expanded if it was collapsed, the group is re-sorted chronologically when the item was created from the group header (existing behaviour), the row is scrolled into view (`block: 'nearest'`), carries `data-highlight="true"` for 2.5 s (accent left border and border colour fading out; static for reduced motion), and focus moves to its name button. If the new row is not in the list (e.g. it was created as hidden and the list filters it), focus returns to the trigger. Edit saves behave the same with the toast "Salvat"; saving a translation keeps the dialog open (as today the form is kept until "Anulează"), see D-5. Acceptance: after creating "Seară de rugăciune" the row `content-row-<newId>` has `data-highlight="true"` and is focused, and no create form is rendered in the page body.
- **FR-113 — Dialog state in the URL.** Opening the create dialog pushes `?new=1` (plus `&group=<groupId>` when started from a group), opening the edit dialog pushes `?edit=<itemId>`; closing removes them. Loading `/admin/content` with those parameters opens the matching dialog once the page data is loaded. Browser Back while a dialog is open follows FR-111's dismissal rules (dirty: the route is restored and the confirmation shown). Unknown `group` ids are ignored (no preselection); an `edit` id that is not in the admin list strips the parameter and shows "Elementul nu mai există". Parameters on other admin routes are ignored. Acceptance: visiting `/admin/content?new=1` shows "Element nou"; pressing Back with an untouched form closes it and leaves `/admin/content`.
- **FR-114 — Edit in the same dialog.** Clicking an item name or "Editează" opens the content dialog in edit layout (title "Editează element", context line = item title, `data-testid="edit-form"`, tabs `tab-edit` / `tab-short-links`, translation locale select) instead of the inline edit form; the inline edit containers and the `editingFormRef` scroll effect are removed. The dismissal rules of FR-111 apply to the Romanian form and to an unsaved translation draft alike; the "Linkuri scurte" tab has no draft state and never asks. Acceptance: editing an item inside a collapsed or expanded group opens the dialog without changing the group's collapsed state, and saving updates the row.

## 6. Design

### 6.1 Data model and API
None. No migration, no endpoint, no shared type. All behaviour is in `packages/app`.

### 6.2 Shell layout
```
≥ 768 px                                   < 768 px
┌──────────┬─────────────────────────┐     ┌──────────────────────┐
│ BETEL    │ page (PageContainer or  │     │ BETEL ADMIN  Conținut│ ← slim header, not sticky
│ ADMIN [⇤]│ full width, unchanged)  │     ├──────────────────────┤
│──────────│                         │     │ page                 │
│ CONȚINUT │                         │     │                      │
│ ▌Conținut│                         │     │                      │
│  Media   │                         │     │          toast ▭     │ ← above the FAB
│  Arhivă  │                         │     │                 (☰)  │ ← FAB, bottom-right
│ RAPOARTE │                         │     └──────────────────────┘
│  …       │                         │
│──────────│                         │
│ email    │                         │
│ ↗ Hub    │                         │
│ ☾ Temă   │                         │
│ ⎋ Ieșire │                         │
└──────────┴─────────────────────────┘
```
- `AdminApp.tsx` keeps `AuthProvider`/`ToastProvider`; `Shell` becomes `<div class="min-h-full md:flex">` with `<AdminSidebar>` (hidden below `md`), `<MobileHeader>` + `<NavFab>`/`<NavDrawer>` (below `md`), and `<main id="admin-main" class="flex-1 min-w-0">` holding the existing `<Routes>`. A "Sari la conținut" skip link targets `#admin-main`.
- Sidebar: `sticky top-0 h-[100dvh] overflow-y-auto`, `bg-[var(--surface)] border-r border-[var(--border)]`, width transition 200 ms (none for reduced motion). Links reuse today's type treatment (`text-xs tracking-widest uppercase font-content`) at a 40 px row height; icons are lucide-react (already a dependency): `FileText` Conținut, `Image` Media, `Archive` Arhivă, `BarChart3` Statistici, `MapPin` Locații, `Users` Utilizatori, `Languages` Traduceri, `Smartphone` Aplicație, `ScrollText` Jurnale, `AlertTriangle` Erori, `Database` SQL, `Globe` Hub-ul public, `Sun`/`Moon`, `LogOut`, `PanelLeftClose`/`PanelLeftOpen`.
- Active state: `aria-current="page"` from `NavLink`, bold, `--text` colour, 2 px `--accent` bar on the left edge and the icon in `--accent` (the accent stays at a few percent of the screen, per the Betel design language). Hover: `--surface-2` background.
- Group headings: `<h2>` 10 px uppercase muted labels; each group is a `<ul>` labelled by its heading. For regular admins the single flat list has no headings.
- Rail tooltips: a small `Tooltip` rendered beside the link on `mouseenter`/`focus`, `aria-hidden` (the link's own visually-hidden label is the accessible name).
- Keyboard: links are in normal tab order (no roving tabindex — a short list of links is simplest and expected); the collapse button is the first focusable control after the skip link.

### 6.3 Phone drawer and FAB
- `NavFab`: `fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))]`, `bg-[var(--text)] text-[var(--bg)] rounded-full`, icon `Menu` / `X`, a 2 px accent hairline under the icon as the Betel "sprinkle", `z-[var(--z-fab)]`. Hidden (`hidden` attribute) while a dialog is open.
- `NavDrawer`: built on `Dialog` with a `drawer` layout (right edge, full height, slide-in 220 ms), its own backdrop, and `initialFocus` on the current link. Its × button is placed at the FAB's coordinates (same size and style, `X` icon), so the FAB appears to morph; focus returns to the FAB on close. Closes on `useLocation()` change.
- Mobile header: not sticky (it carries no controls, so it may scroll away and give the page the full height).

### 6.4 Dialog primitive and the content dialog
- Native `<dialog>` + `showModal()` gives the top layer (no z-index fights with the sidebar or FAB), automatic inertness of the rest of the document and a focus trap; the primitive adds what the platform does not do consistently: focus return, scroll lock, `cancel` veto, backdrop-click detection, stacking order for `Esc`, and the toast outlet. Rationale and alternatives: ADR-027.
- `ContentDialog` (new, `components/content/ContentDialog.tsx`) owns: mode (`create` | `edit`), the URL sync (FR-113), the dirty flag reported by `ContentForm`, the discard confirmation and the after-save landing (FR-112). `ContentForm` itself stays a form: it gains an `onDirtyChange(dirty: boolean)` prop, renders its action buttons into the dialog footer (`footer` render prop) and drops its outer `border … mb-6` wrapper when hosted in the dialog.
- `ContentForm` is moved out of `ContentPage.tsx` (1 915 lines) into `components/content/ContentForm.tsx` with its helpers (`itemToForm`, `formToPayload`, `ImagePicker`, `MediaLibraryModal`, `SiteLinkOverrides`, `LocationCounter`). This is a move, not a rewrite; it keeps the dialog work reviewable.
- Dirty check: compare `formToPayload(form)` (and `transForm` in translation mode) with the value captured when the dialog opened, using a stable JSON comparison.
- After-save landing: `ContentPage` keeps a `pendingHighlightId`; after the invalidated query resolves it expands the containing group if needed, then a `useEffect` scrolls, sets `data-highlight` (cleared after 2.5 s) and focuses the row's name button.
- Copy (Romanian, admin): "Element nou", "Editează element", "Creează", "Salvează", "Anulează", "Închide", "Renunți la modificări?", "Ai modificări nesalvate. Dacă închizi, se pierd.", "Continuă editarea", "Renunță", "Elementul nu mai există", "Deschide meniul", "Închide meniul", "Meniu admin", "Navigare admin", "Restrânge meniul", "Extinde meniul", "Hub-ul public", "Sari la conținut", "Rapoarte", "Administrare", "Sistem".

### 6.5 Configuration, security, performance
- No environment variables.
- Security: menu visibility is presentation only; the API's `preHandler` role checks stay the authority (§12.4, `security.md`). The route guard keeps rendering super-admin routes only for super-admins, now driven by `navigation.ts`.
- Privacy: `betel-admin-sidebar` stores only `expanded`/`collapsed`.
- Performance: no new dependency (native `<dialog>`, existing lucide-react icons). The admin chunk stays out of the service-worker precache (unchanged).

## 7. Contracts

**Provides**
- `packages/app/src/admin/navigation.ts` — the single admin menu definition (`ADMIN_NAV: NavGroup[]`, `visibleNav(role)`), consumed by the sidebar, drawer and route guard. Any spec adding an admin page adds one item here (and its route) instead of editing the shell. **Spec 01 (PWA)** consumes it: its "Aplicație" link becomes `{ id: 'pwa', path: 'pwa', label: 'Aplicație', icon: Smartphone, superAdminOnly: true }` in the Administrare group, replacing its planned edit of the top bar in `AdminApp.tsx`.
- `packages/app/src/admin/components/ui/Dialog.tsx` — the admin dialog primitive (FR-110) for any future admin modal; spec 01's admin page (e.g. confirmation of "re-invite") should use it.
- Admin z-index tokens `--z-sidebar`, `--z-fab`, `--z-toast` (FR-109).
- Test ids: `nav-<id>`, `nav-fab`, `nav-drawer`, `nav-drawer-close`, `sidebar-collapse`, `content-dialog`, `content-dialog-close`, `discard-confirm`, `discard-confirm-keep`, `discard-confirm-discard`; kept: `create-content-btn`, `create-group-btn`, `create-form`, `edit-form`, all field ids, `admin-theme-toggle`, `toast`, `toast-container`. Removed: `hamburger-btn`, `mobile-menu`.

**Consumes**
- Spec 04 / 07 form fields (dates row, start time, location) — moved unchanged inside `ContentForm`.
- Spec 06's `ShortLinksTab` / `ShortLinkPreviewPanel` — rendered unchanged in the edit dialog's "Linkuri scurte" tab.

**Proposed rows for the specs README** (coordinator applies):

Specs table:
```markdown
| 9 | [09-admin-sidebar-and-create-modal.md](09-admin-sidebar-and-create-modal.md) — grouped, role-aware admin sidebar (rail on desktop, FAB drawer on phones) and content create/edit in a modal dialog | Admin shell / navigation, admin dialogs | FR-105 – FR-114 | ADR-027 | none |
```
Business-rules line: append `, 9 → BR-060–064 (BR-061–064 reserved, unused)`.

Fixed contracts bullet:
```markdown
- **Admin navigation:** every admin page is declared once in `packages/app/src/admin/navigation.ts` (spec 09); the sidebar, phone drawer and super-admin route guard read it. Spec 01's "Aplicație" page is added there as `{ id: 'pwa', path: 'pwa', label: 'Aplicație', superAdminOnly: true }` in the Administrare group, not in the shell.
```

Delivery order note: "09 and 01 can land in either order. If 01 lands first it adds 'Aplicație' to the top bar and 09 moves it into `navigation.ts`; if 09 lands first, 01 adds one item to `navigation.ts` (preferred)."

Ownership table:
```markdown
| Admin navigation (sidebar, phone drawer, menu definition `packages/app/src/admin/navigation.ts`) and the admin shell layout in `AdminApp.tsx` | 9 Admin sidebar | 1 (adds the "Aplicație" item to `navigation.ts` instead of the top bar) |
| Admin dialog primitive `packages/app/src/admin/components/ui/Dialog.tsx`, admin overlay z-index tokens, toast placement | 9 Admin sidebar | 1 (any admin modal) |
| Admin content create/edit form container (dialog, URL state, unsaved-changes rule) | 9 Admin sidebar | 4 and 7 own the fields inside the form; 6 owns the short-links tab |
```

**Overlap check with spec 08 (public section preview):** none. Spec 08 touches only public files (`GroupBlock.tsx`, `public/i18n/keys.ts`, the snapshot parity test); this spec touches only `packages/app/src/admin/**`, `index.css` (admin tokens block) and admin Cypress specs. The one shared file is `packages/app/src/index.css`: 09 adds z-index tokens inside `:root.admin-theme`; 08 would only touch public styles, so a textual merge at worst.

**Ordering with spec 01:** if 01 lands first it adds "Aplicație" to the top bar; 09 then moves it into `navigation.ts`. If 09 lands first, 01 adds the item to `navigation.ts` (one line) — preferred.

## 8. Rollout

- No flag: the change is UI-only, admin-only and reversible by revert. Ship sidebar (T1–T3) and dialog (T4–T6) as two PRs or one; the sidebar does not depend on the dialog except that the drawer uses the `Dialog` primitive — build T4 first or give the drawer its own minimal focus handling and switch later.
- No migration, no API deploy order.
- Rollback: revert the PR(s). `betel-admin-sidebar` left in `localStorage` is harmless.
- Tell editors in one line (WhatsApp group): "Meniul admin e acum în stânga (pe telefon: butonul rotund din dreapta-jos); «+ Adaugă» deschide o fereastră."

## 9. Testing

All Cypress specs stub the API (`cy.intercept`); no backend change exists to verify manually.

### 9.1 New specs
- `cypress/e2e/admin-sidebar.cy.ts` (replaces `admin-mobile-menu.cy.ts`)
  - Happy flow (super-admin, 1280 × 800): sidebar visible, four group headings, ten `nav-*` links; `nav-content` has `aria-current="page"`; clicking `nav-media` navigates to `/admin/media` and moves `aria-current`; no element `hamburger-btn` exists.
  - Regular admin: only `nav-content`, `nav-media`, `nav-archive`, `nav-analytics`; no `h2` in the nav; footer shows the email and "Admin".
  - Collapse: click `sidebar-collapse` → `aria-expanded="false"`, sidebar width ≤ 72 px, `localStorage['betel-admin-sidebar'] === 'collapsed'`; reload → still collapsed; each link still has its label as accessible name (`should('have.attr','aria-label')` or contains visually hidden text).
  - Default at 1000 × 660 (Cypress default) without stored value: rail; at 1280: expanded.
  - Phone (375 × 812): `nav-fab` visible, sidebar not visible; click → `nav-drawer` visible, focus on `nav-content`, `nav-drawer-close` occupies the FAB's position; click `nav-media` → navigates, drawer gone; reopen, `Esc` → drawer gone and `nav-fab` focused; backdrop click and `nav-drawer-close` close it.
  - Regression (FR-109): at 375 px trigger a toast (stub a create) and assert the toast's and the FAB's bounding rects do not intersect.
  - Regression: theme toggle in the sidebar footer still toggles `data-theme` (keeps `admin-theme.cy.ts` meaningful), and in the drawer on phones.
- `cypress/e2e/admin-content-dialog.cy.ts`
  - Happy flow: `create-content-btn` → `content-dialog` visible with `role="dialog"`, `aria-modal="true"`, URL contains `new=1`, focus in `create-type-select`; fill title, submit (stub `POST /api/admin/content` returning the item and the follow-up list) → dialog gone, toast "Element creat", `content-row-<id>` has `data-highlight="true"` and is focused, URL has no `new`.
  - From a group header: `group-add-content-<gid>` → URL has `group=<gid>`, group select preselected; after save the group is expanded and re-sorted (existing chronological assertion).
  - Dismissal, clean: open, `Esc` → closed, focus back on `create-content-btn`; open, click backdrop (coordinates outside the panel) → closed.
  - Dismissal, dirty: type a title, `Esc` → `discard-confirm` visible with focus on `discard-confirm-keep`; keep → title still there; `Esc` again then `discard-confirm-discard` → closed and no POST was made (`cy.get('@create.all').should('have.length', 0)`).
  - Regression: a mouse drag that starts inside the title field and ends on the backdrop does not close the dialog.
  - Regression (modality): with the dialog open, `dialog[open]` matches `:modal` (`el.matches(':modal')`) and `<html>` has the scroll-lock style. Real `Tab` cycling and background inertness are covered by the manual checks (the suite has no real-keyboard plugin and Cypress does not reliably reproduce native inertness).
  - Deep link: visit `/admin/content?new=1` → dialog open; `cy.go('back')` on an untouched form → closed. `?edit=<missing>` → toast "Elementul nu mai există", URL cleaned.
  - Nested: open the media library from the image picker → two `dialog[open]`; `Esc` closes only the library.
  - Phone (375 × 812): dialog fills the viewport (rect ≈ viewport), footer buttons visible without scrolling, `nav-fab` hidden while open.
  - Edit (FR-114): click `content-name-<id>` → `edit-form` inside `content-dialog`, title "Editează element"; save → toast "Salvat", row highlighted.

### 9.2 Existing specs that need updates
| Spec | Uses | Change |
|---|---|---|
| `admin-mobile-menu.cy.ts` | `hamburger-btn`, `mobile-menu`, "Ieșire" in the dropdown | Delete; covered by `admin-sidebar.cy.ts` |
| `admin-content-form.cy.ts` | `create-content-btn` (13×), `edit-form` (5×) | Selectors still valid; assertions that the form renders "at the top" / that `edit-form` follows a row must become "inside `content-dialog`"; any "Anulează" after typing now needs `discard-confirm-discard` |
| `admin-content-translation.cy.ts` | `create-form`, `edit-form`, `create-content-btn` | Same as above; translation-save keeps the dialog open (FR-112) |
| `admin-groups.cy.ts` | `group-add-content`, `create-form`, `window:confirm` (group delete, unaffected) | Form now in the dialog; check URL `group=` preselection |
| `admin-group-chronological-order.cy.ts` | `group-add-content` (5×) | Form in the dialog; re-sort assertion unchanged |
| `admin-site-link-overrides.cy.ts` | `create-content-btn` (14×) | Should pass unchanged; verify the overrides toggle scrolls inside the dialog body |
| `admin-media.cy.ts` | `create-content-btn`, `upload-btn` | Media library now a stacked dialog; selectors unchanged |
| `admin-short-links.cy.ts` | edit form tab `tab-short-links`, `cy.contains('Anulează').first()` | Scope the "Anulează" lookup to the short-link form (the dialog footer also has "Anulează") |
| `admin-toast.cy.ts` | `create-content-btn`, `toast` | Toast now appears after the dialog closes; position assertions, if any, follow FR-109 |
| `admin.cy.ts` | `create-form`, `create-content-btn` | Form in the dialog |
| `event-start-time.cy.ts`, `event-location.cy.ts` | `create-content-btn`, `edit-form` | Form in the dialog; public-side `article` assertions unchanged |
| `admin-theme.cy.ts` | `admin-theme-toggle`; line 87 finds the shell as `querySelector('nav').parentElement` | Toggle moved to the sidebar footer (same test id). Rewrite the shell lookup to `[data-testid="admin-shell"]` (the first `nav` is now inside the sidebar); the assertion shell height ≥ `scrollHeight` must still hold (document scrolling kept) |
| `admin-sql-console.cy.ts` | `cy.get('nav').contains('SQL').should('not.exist')` | Still valid (single `<nav>` at desktop width); prefer `nav-sql` should not exist |

`semantic-html.cy.ts` asserts the public `nav[aria-label="Locații"]` and is unaffected.

### 9.3 Manual checks
- VoiceOver (iOS Safari) and NVDA or VoiceOver (desktop): the sidebar is announced as "Navigare admin, navigation"; the current page is announced as current; the create dialog is announced with its title; the page behind is not reachable with the screen reader's virtual cursor; closing returns to "+ Adaugă".
- iOS Safari: dialog sheet with the keyboard open keeps the footer reachable (`100dvh`), background does not scroll (rubber-banding), FAB respects the home-indicator inset.
- Light and dark theme: sidebar, rail tooltip, FAB, backdrop, confirmation contrast ≥ 4.5:1 for text.

## 10. Work breakdown

| # | Task | Files | Depends on |
|---|---|---|---|
| T1 | Menu definition and route guard from one source | new `packages/app/src/admin/navigation.ts`; `AdminApp.tsx` (routes read `visibleNav(role)` for super-admin gating) | — |
| T2 | Desktop sidebar: expanded/rail, persisted preference, tooltips, footer (user, hub link, theme, logout), skip link; remove top bar | new `admin/components/shell/AdminSidebar.tsx`, `SidebarLink.tsx`, `RailTooltip.tsx`, `useSidebarPreference.ts`; `AdminApp.tsx`; `index.css` (admin z-index tokens) | T1 |
| T3 | Phone header, FAB and drawer; toast placement above the FAB; page bottom padding | new `admin/components/shell/MobileHeader.tsx`, `NavFab.tsx`, `NavDrawer.tsx`; `context/ToastContext.tsx`; `AdminApp.tsx` | T1, T4 (drawer on `Dialog`) |
| T4 | Dialog primitive (native `<dialog>`, scroll lock, focus return, `cancel` veto, backdrop rule, stacking, sheet layout, toast outlet) and migrate `MediaLibraryModal` | new `admin/components/ui/Dialog.tsx`, `useScrollLock.ts`, `DialogStackContext.tsx`; `context/ToastContext.tsx` (portal into the top dialog) | — |
| T5 | Move `ContentForm` and its helpers out of `ContentPage.tsx` (pure move, no behaviour change) | new `admin/components/content/ContentForm.tsx` (+ `ImagePicker.tsx`, `MediaLibraryModal.tsx`, `SiteLinkOverrides.tsx`, `form-model.ts` for `itemToForm`/`formToPayload`); `pages/ContentPage.tsx` | — (do first, merge early: it touches the same file as T6) |
| T6 | Content dialog: create (and edit, FR-114), dirty tracking, discard confirmation, `beforeunload`, URL state, after-save landing (expand group, scroll, highlight, focus); remove inline create/edit rendering and `editingFormRef` | new `admin/components/content/ContentDialog.tsx`, `DiscardConfirm.tsx`, `useDialogSearchParam.ts`; `components/content/ContentForm.tsx`; `pages/ContentPage.tsx` (row `data-highlight`, name button ref) | T4, T5 |
| T7 | Cypress: new `admin-sidebar.cy.ts`, `admin-content-dialog.cy.ts`; update the specs in §9.2; delete `admin-mobile-menu.cy.ts` | `cypress/e2e/*` | T2, T3, T6 |
| T8 *(optional, follow-up)* | Move `ItemDailyModal` and `SqlConfirmModal` onto `Dialog` | `components/analytics/ItemDailyModal.tsx`, `components/sql/SqlConfirmModal.tsx` | T4 |
| T9 | Docs (with the code): apply §12 snippets marked "with the code" | `docs/product/requirements.md`, `user-flows.md`, `docs/domain/business-rules.md`, ADR-027 status | T2–T6 |

T1/T2/T3 (shell) and T4/T5/T6 (dialog) can be built by two developers in parallel; they meet only in `ToastContext.tsx` (T3 placement vs. T4 outlet — small, coordinate) and `AdminApp.tsx` (T4 does not touch it). Use the `frontend-design` skill for T2, T3, T6.

## 11. Open questions

None open. The product owner accepted the recommended default for each question on 2026-11-03; the decisions are recorded here so implementers know which alternatives were rejected.

| # | Question | Decision | Rejected alternative |
|---|---|---|---|
| D-1 | Should editing move into the same dialog? | **Yes, in this spec** (FR-114, the `?edit=` half of FR-113): one pattern for create and edit, no scroll-into-view workaround, no inline form inside group blocks | Keep inline edit; only create becomes modal |
| D-2 | Should regular admins see fewer pages than today? | **No: they keep Conținut, Media, Arhivă, Statistici.** They are allowed to use all four, and hiding one would only move work to a super-admin | Hide Arhivă or Statistici (a permission change that would also restrict the API) |
| D-3 | Which side does the phone drawer open from? | **The right**, next to the FAB and the thumb | The left, mirroring the desktop sidebar |
| D-4 | Should "+ Grup nou" and the group edit panel become dialogs too? | **Not now.** They are two-field forms, ADR-002 keeps group management inline, and the reported problem was the item form. Revisit after this ships | Move them into small dialogs |
| D-5 | After saving a translation, close or stay? | **Stay open** (as today), so several locales can be filled in one go; the toast confirms | Close like the Romanian save |
| D-6 | Keep a draft if the tab is closed or the dialog discarded? | **No.** The confirmation and `beforeunload` already prevent accidental loss | `localStorage` drafts |
| D-7 | Add a "Hub-ul public" link to the sidebar footer? | **Yes**, it opens `/` in a new tab | Leave it out |
| D-8 | Default sidebar state between 768 and 1023 px? | **Icon rail**, expanded from 1024 px; a stored preference always wins | Always expanded until the user collapses it |

## 12. Doc integration

### 12.1 `docs/product/requirements.md` — Planned Features (apply now)
```markdown
#### Admin Navigation & Content Dialog
Spec: [09-admin-sidebar-and-create-modal.md](specs/09-admin-sidebar-and-create-modal.md). ADR-027 (Proposed).
- FR-105: Admin sidebar replaces the top navigation bar at ≥ 768 px (menu, user, hub link, theme toggle, logout; active page marked). **[Planned]**
- FR-106: One menu definition (`admin/navigation.ts`) drives the sidebar, phone drawer and super-admin route guard; regular admins see a flat list of four pages, super-admins four labelled groups. **[Planned]**
- FR-107: The sidebar collapses to an icon rail with tooltips; the choice is remembered per device. **[Planned]**
- FR-108: Below 768 px a bottom-right floating action button opens the menu as an accessible drawer. **[Planned]**
- FR-109: Admin floating layers share one z-index scale; toasts never overlap the FAB. **[Planned]**
- FR-110: A shared accessible admin dialog primitive (native `<dialog>`, focus trap and return, scroll lock, guarded `Esc`/backdrop, stacking, full-screen sheet on phones). **[Planned]**
- FR-111: Content items are created in a modal dialog; unsaved input is never discarded without confirmation. **[Planned]**
- FR-112: After saving, the dialog closes and the item is scrolled into view, highlighted and focused. **[Planned]**
- FR-113: The create/edit dialog state is in the URL (`?new=1`, `&group=`, `?edit=`), and Back closes it. **[Planned]**
- FR-114: Content items are edited in the same dialog. **[Planned]**
```

### 12.2 `docs/product/roadmap.md` (apply now)
```markdown
- **Admin sidebar and content dialog [planned]** — grouped, role-aware sidebar (icon rail on desktop, FAB drawer on phones) replacing the top bar; content create/edit in an accessible modal dialog. Spec 09, FR-105–FR-114, ADR-027.
```

### 12.3 ADR index row (apply now) and ADR file
Index row in `docs/decisions/README.md`:
```markdown
| [ADR-027](ADR-027-admin-dialogs-native-dialog-and-modal-content-form.md) | Admin dialogs use one native-`<dialog>` primitive; content items are created and edited in a modal | Proposed |
```
File `docs/decisions/ADR-027-admin-dialogs-native-dialog-and-modal-content-form.md`:
```markdown
# ADR-027: Admin dialogs use one native `<dialog>` primitive; content items are created and edited in a modal

- **Status:** Proposed
- **Date:** 2026-11-03
- **Related:** ADR-002 (group management inline on the Content page)
- **Implements:** FR-108, FR-110, FR-111, FR-113, FR-114

## Context
The admin has four hand-rolled overlays (`fixed inset-0 z-50` divs) without focus trapping, scroll lock or focus return, and the content create/edit form renders inline in the list, where it scrolls away, competes with drag-and-drop and can be closed with unsaved input. Spec 09 needs a modal create/edit form, a phone navigation drawer and a media picker that opens on top of the form, all accessible.

## Options Considered
1. **Native `<dialog>` with `showModal()` wrapped in one React primitive.** Top layer (no z-index conflicts with the sidebar, FAB or toasts' stacking), built-in inertness of the background and focus containment, `cancel` event for `Esc`. Needs small additions: scroll lock, focus return, backdrop-click detection, veto of `cancel`, and toasts portalled into the top dialog because the top layer covers fixed elements. Supported by every browser the admin targets.
2. **Hand-rolled div overlay + `inert` on the app root.** Full control, but focus trap, stacking and `Esc` ordering have to be written and tested by hand; z-index must be managed against every other fixed element.
3. **A headless UI library (Radix Dialog, Headless UI).** Mature accessibility, but a new dependency and styling layer for four or five dialogs.
4. **Keep inline forms; only add an unsaved-changes guard.** Least work; does not meet the request that the page be blocked until the form is dismissed.

## Decision
Option 1. `packages/app/src/admin/components/ui/Dialog.tsx` is the only way to build an admin modal; new admin overlays use it. Content items are created and edited in a dialog whose open state is in the URL (`?new=1`, `?edit=<id>`). Dismissing a dialog with unsaved input always asks first (BR-060). While a content dialog is open nothing else on the admin page can be used. Group creation and group editing stay inline (ADR-002 unchanged).

## Consequences
- One tested place for dialog accessibility; nested dialogs (media library over the content form) work by construction.
- Toasts must render inside the top open dialog while one is open.
- Cypress tests interact with `dialog[open]`; the background is inert, so tests can no longer click page controls while a dialog is open.
- Follow-up: migrate `ItemDailyModal` and `SqlConfirmModal` onto the primitive.
```

### 12.4 With the code — `docs/domain/business-rules.md` and `docs/architecture/security.md`
Business rule (the only domain-level rule here; the menu-visibility rule is a security note, and "create and edit in a modal" is a UI decision recorded in ADR-027):
```markdown
- BR-060: The admin never discards unsaved form input silently. Closing a changed form by any path (`Esc`, backdrop, close button, "Anulează", browser Back) asks for confirmation; an unchanged form closes at once; a save in progress cannot be dismissed; closing or reloading the tab with a changed form triggers the browser's leave-page warning.
```
Changelog line: `- BR-060 added: <date> (admin unsaved-input rule, FR-111; BR-061 – BR-064 reserved, unused)`.

`security.md` → Roles, one sentence after the role matrix:
```markdown
- **Admin menu:** the admin sidebar shows a page only to roles whose route guard renders it (`packages/app/src/admin/navigation.ts` drives both). It is presentation only and never replaces the API's role checks; the API may allow more than a page exposes (e.g. `admin` may read languages and UI translations, while the Traduceri page is super-admin only).
```
`entities.md`, `glossary.md`, `content-model.md`, `configuration.md`: no change.

### 12.5 With the code — amendments to existing requirements
- FR-095: replace "offers a sun/moon toggle in the top navigation" with "offers a sun/moon toggle in the sidebar footer (in the drawer on phones)"; in its implementation note, add "admin overlay z-index tokens `--z-sidebar`, `--z-fab`, `--z-toast` (FR-109)" to the list of tokens under `:root.admin-theme`.
- FR-026 sub-bullet: replace "Clicking a content item's name opens its inline edit form (same as the "Editează" menu action)." with "Clicking a content item's name opens the content dialog in edit mode (same as the "Editează" menu action) — FR-114."
- Requirements that name a "nav link" (`/admin/error-logs` "Erori nav link", `/admin/sql` "SQL nav link"): change "nav link" to "sidebar link".
- On ship: move FR-105 – FR-114 to the permanent admin section with the implementation date; set ADR-027 to Accepted.

### 12.6 With the code — `docs/product/user-flows.md`
In Flow 3:
- replace "To edit a content item: admin clicks the item name directly (shortcut) or uses the "Editează" option in the item context menu; both open the inline content form" with "… both open the content dialog (Editează element)".
- replace "via the "+ adaugă conținut în grup" inline form" with "via "Adaugă conținut în grup", which opens the content dialog with the group preselected".
- "To assign an item to a group while editing: admin opens the item form …" → "… opens the item in the content dialog …".
- The success state ("groups are created, populated, reordered, and collapsed without leaving the Content page") stays true; no change.

New flow:
```markdown
### Flow 19 (Admin) — Creating a content item in the dialog
- Trigger: an admin wants to add a card, poster, text or video
- Steps:
  - On Conținut the admin clicks "+ Adaugă" (or "Adaugă conținut în grup" on a group header); the "Element nou" dialog opens over the page (full screen on a phone) and the page behind cannot be used
  - The admin fills the form and clicks "Creează"
  - The dialog closes, the toast says "Element creat", and the new item is scrolled into view, highlighted and focused (its group expanded and re-sorted chronologically when created from the group header)
- Success state: the item exists and the admin can see where it landed
- Failure or edge states:
  - Validation or server error: the dialog stays open with the message, nothing typed is lost
  - The admin presses Esc, clicks outside, "Anulează" or Back after typing: "Renunți la modificări?" asks before anything is discarded; "Continuă editarea" returns to the form
  - The admin closes or reloads the tab with unsaved input: the browser's leave-page warning appears
```
Flow 8 ("The super-admin opens `/admin/sql` ("SQL" nav link)"): "nav link" → "sidebar link".

### 12.7 Other docs
- `README.md`, `docs/architecture/overview.md`: checked — neither mentions the admin top bar or navigation bar; no change.
- `docs/product/specs/01-pwa.md` (coordinator, while 01 is unshipped): in §3 "Admin pages" and in its admin-page task, replace "nav + routes in `AdminApp.tsx`" with "add one item to `packages/app/src/admin/navigation.ts` (spec 09) and its route".
- ADR-002 needs no amendment: its "inline" wording covers group creation and editing, which stay inline.
