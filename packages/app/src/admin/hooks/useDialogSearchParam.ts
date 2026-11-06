import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Content page dialogs live in the URL (FR-113): `?new=1` (`&group=<id>`), `?edit=<id>`,
 * `?newGroup=1`, `?editGroup=<id>`. Opening pushes one history entry marked
 * `{ adminDialog: true }`, so Back (or closing) pops exactly that entry; a deep link is
 * normalised into the same shape (list entry + dialog entry) once the page can open it.
 */

export type ContentPageDialog =
  | { kind: 'create'; groupId: string | null }
  | { kind: 'edit'; id: string }
  | { kind: 'newGroup' }
  | { kind: 'editGroup'; id: string }

const DIALOG_PARAMS = ['new', 'group', 'edit', 'newGroup', 'editGroup'] as const
const DIALOG_STATE_KEY = 'adminDialog'

export function parseDialog(params: URLSearchParams): ContentPageDialog | null {
  if (params.get('new') === '1') return { kind: 'create', groupId: params.get('group') || null }
  const edit = params.get('edit')
  if (edit) return { kind: 'edit', id: edit }
  if (params.get('newGroup') === '1') return { kind: 'newGroup' }
  const editGroup = params.get('editGroup')
  if (editGroup) return { kind: 'editGroup', id: editGroup }
  return null
}

function withoutDialog(search: string): URLSearchParams {
  const params = new URLSearchParams(search)
  for (const p of DIALOG_PARAMS) params.delete(p)
  return params
}

function toSearch(params: URLSearchParams): string {
  const s = params.toString()
  return s ? `?${s}` : ''
}

function withDialog(search: string, d: ContentPageDialog): string {
  const params = withoutDialog(search)
  if (d.kind === 'create') {
    params.set('new', '1')
    if (d.groupId) params.set('group', d.groupId)
  } else if (d.kind === 'edit') params.set('edit', d.id)
  else if (d.kind === 'newGroup') params.set('newGroup', '1')
  else params.set('editGroup', d.id)
  return toSearch(params)
}

function isDialogEntry(state: unknown): boolean {
  return !!(state && typeof state === 'object' && (state as Record<string, unknown>)[DIALOG_STATE_KEY])
}

export function dialogKey(d: ContentPageDialog): string {
  return 'id' in d ? `${d.kind}:${d.id}` : d.kind === 'create' ? `create:${d.groupId ?? ''}` : d.kind
}

export function useDialogSearchParam() {
  const location = useLocation()
  const navigate = useNavigate()
  const dialog = parseDialog(new URLSearchParams(location.search))
  const pushed = isDialogEntry(location.state)
  const base = { pathname: location.pathname, hash: location.hash }

  return {
    dialog,
    /** Open a dialog: one new history entry. */
    open(d: ContentPageDialog) {
      navigate({ ...base, search: withDialog(location.search, d) }, { state: { [DIALOG_STATE_KEY]: true } })
    },
    /** Close the dialog: pop its entry, or drop the parameters when there is none to pop. */
    close() {
      if (pushed) navigate(-1)
      else navigate({ ...base, search: toSearch(withoutDialog(location.search)) }, { replace: true })
    },
    /** Remove the parameters without a new entry (unknown ids). */
    strip() {
      navigate({ ...base, search: toSearch(withoutDialog(location.search)) }, { replace: true })
    },
    /** A pasted or reloaded dialog URL without its own entry: give it list + dialog entries. */
    normalizeDeepLink() {
      if (!dialog || pushed) return
      navigate({ ...base, search: toSearch(withoutDialog(location.search)) }, { replace: true })
      navigate({ ...base, search: location.search }, { state: { [DIALOG_STATE_KEY]: true } })
    },
  }
}
