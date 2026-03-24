/**
 * Regression test: Admin page hangs on soft reload (F5/Ctrl+R) in Chrome.
 *
 * Root cause: The PWA service worker was registered with scope '/' and its
 * NavigationRoute intercepted all navigation requests, including /admin/.
 * On soft reload the SW served the PWA index.html instead of the admin app,
 * so the React admin app never mounted.
 *
 * Fix: Added navigateFallbackDenylist: [/^\/admin/] to the workbox config
 * so the SW lets /admin/* navigations pass through to the network.
 */
const ADMIN_URL = 'http://localhost:5174/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [{ slug: 'centru', name: 'Centru', accent: '#3b82f6' }]

function setupInterceptors() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
}

describe('Admin — soft reload regression', () => {
  it('mounts the React admin app after cy.reload() (simulates soft reload)', () => {
    setupInterceptors()
    cy.visit(ADMIN_URL, {
      onBeforeLoad(win) {
        win.localStorage.setItem('betel-admin-token', mockToken)
      },
    })
    cy.wait('@me')
    // App should be mounted with navigation visible
    cy.contains('BETEL ADMIN').should('be.visible')

    // Simulate a soft reload — if the SW intercept bug were present this would hang
    setupInterceptors()
    cy.reload()
    cy.wait('@me')

    // Admin app must still mount correctly, not show PWA content
    cy.contains('BETEL ADMIN').should('be.visible')
    cy.get('[data-testid="content-list"]').should('exist')
  })
})
