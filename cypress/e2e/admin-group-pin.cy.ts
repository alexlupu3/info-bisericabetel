/**
 * Spec 08 — FR-104: icon-only pin toggle on group item rows (outline pin / filled pin), with a
 * hint beyond the third pin; FR-103 / BR-057 regression: saving a pinned item without
 * changing its group keeps the pin.
 */
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const group = { id: 'g1', title: 'Evenimente', sites: [], orderPosition: 0, state: 'published', createdAt: '', updatedAt: '' }

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'card', state: 'published', sites: [], exclusiveSite: null, orderPosition: 0,
  groupId: 'g1', pinnedInGroup: false, expiresAt: null, data: { title: `Card ${id}` },
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra,
})

function setup(items: object[]) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [group] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.intercept('GET', '/api/languages', { languages: [{ code: 'ro', name: 'Română', isDefault: true, enabled: true }] })
  cy.intercept('GET', '/api/admin/languages', { languages: [{ code: 'ro', name: 'Română', isDefault: true, enabled: true }] })
  cy.intercept('GET', '/api/admin/content/*/translations', { translations: [] })
  cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] })
  cy.visit('/admin/', { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', 'mock-jwt-token') } })
  cy.wait(['@me', '@content', '@groups'])
  cy.get('[data-testid="collapse-toggle-g1"]').click()
}

describe('Admin — pin a group item to the phone preview', () => {
  it('pins an item with PATCH { pinnedInGroup: true } and shows it pressed', () => {
    setup([item('a'), item('b'), { ...item('root'), groupId: null }])
    cy.intercept('PATCH', '/api/admin/content/a', req => {
      req.reply({ ...item('a'), pinnedInGroup: req.body.pinnedInGroup })
    }).as('patch')
    cy.get('[data-testid="pin-toggle-a"]')
      .should('have.attr', 'aria-pressed', 'false')
      .and('have.attr', 'aria-label', 'Fixează pe mobil')
      .and('not.contain.text', 'Fixat')
    cy.get('[data-testid="pin-toggle-a"] svg').should('have.attr', 'fill', 'none')
    cy.get('[data-testid="pin-toggle-a"]')
      .and('have.attr', 'title', 'Apare primul în previzualizarea grupului pe telefon')
    cy.intercept('GET', '/api/admin/content', { items: [item('a', { pinnedInGroup: true }), item('b'), { ...item('root'), groupId: null }] })
    cy.get('[data-testid="pin-toggle-a"]').click()
    cy.wait('@patch').its('request.body').should('deep.equal', { pinnedInGroup: true })
    cy.get('[data-testid="pin-toggle-a"]').should('have.attr', 'aria-pressed', 'true').and('not.contain.text', 'Fixat')
    cy.get('[data-testid="pin-toggle-a"] svg').should('have.attr', 'fill', 'currentColor')
    // Root-level rows have no toggle.
    cy.get('[data-testid="content-row-root"]').should('exist')
    cy.get('[data-testid="pin-toggle-root"]').should('not.exist')
  })

  it('every pinned item leads the deck: no "first three" hint (regression)', () => {
    cy.viewport(1280, 800)
    setup(['a', 'b', 'c', 'd'].map(id => item(id, { pinnedInGroup: true })))
    cy.get('[data-testid="pin-toggle-d"]').should('have.attr', 'title', 'Apare primul în previzualizarea grupului pe telefon')
    cy.get('[data-testid^="pin-hint-"]').should('not.exist')
  })

  it('saving a pinned item without changing its group keeps the pin (regression)', () => {
    setup([item('a', { pinnedInGroup: true }), item('b')])
    cy.intercept('PATCH', '/api/admin/content/a', req => {
      req.reply({ ...item('a', { pinnedInGroup: true }), data: { title: 'Card a' } })
    }).as('save')
    cy.get('[data-testid="content-name-a"]').click()
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@save').its('request.body').should(body => {
      expect(body.groupId).to.equal('g1')
      expect(body).not.to.have.property('pinnedInGroup')
    })
    cy.get('[data-testid="pin-toggle-a"]').should('have.attr', 'aria-pressed', 'true')
    cy.get('[data-testid="pin-toggle-a"] svg').should('have.attr', 'fill', 'currentColor')
  })
})
