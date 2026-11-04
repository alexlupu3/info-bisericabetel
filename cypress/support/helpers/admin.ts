/**
 * Shared stubs for the admin shell and Content page specs (spec 09: sidebar, dialogs).
 */
export const ADMIN_TOKEN = 'mock-jwt-token'

export const SITES = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

export function adminUser(role: 'admin' | 'super-admin' = 'admin') {
  return {
    id: 'u1',
    email: role === 'super-admin' ? 'super@betel.ro' : 'admin@betel.ro',
    role,
    mustChangePassword: false,
  }
}

export function contentItem(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, type: 'card', state: 'draft', sites: [], exclusiveSite: null, orderPosition: 0, groupId: null,
    expiresAt: null, data: { title }, createdAt: '', updatedAt: '', ...extra,
  }
}

export function group(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '', ...extra }
}

/** Stubs auth, content, groups, sites and the endpoints the content form reads. */
export function stubAdmin({ role = 'admin', items = [], groups = [] }: {
  role?: 'admin' | 'super-admin'
  items?: object[]
  groups?: object[]
} = {}) {
  cy.intercept('GET', '/api/auth/me', adminUser(role)).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: SITES }).as('sites')
  cy.intercept('GET', '/api/admin/languages', { languages: [] })
  cy.intercept('GET', '/api/admin/media', { media: [] })
  cy.intercept('GET', '/api/admin/content/*/translations', { translations: [] })
  cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] })
}

/** Visits an admin URL signed in; `storage` seeds extra localStorage keys. */
export function visitAdmin(path = '/admin/content', storage: Record<string, string> = {}) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('betel-admin-token', ADMIN_TOKEN)
      for (const [k, v] of Object.entries(storage)) win.localStorage.setItem(k, v)
    },
  })
  cy.wait('@me')
}

/** Dispatches a cancelable `beforeunload` and yields whether a listener prevented it. */
export function beforeUnloadPrevented(): Cypress.Chainable<boolean> {
  return cy.window().then(win => {
    const e = new win.Event('beforeunload', { cancelable: true })
    win.dispatchEvent(e)
    return e.defaultPrevented
  })
}

/** A click on a dialog's backdrop: pointer down and up on the <dialog> itself, outside its panel. */
export function clickBackdrop(testId: string) {
  cy.get(`[data-testid="${testId}"]`).click(5, 5)
}
