/**
 * Admin light / dark theme
 */
const ADMIN_URL = '/admin/'

const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

// Enough items to make the content page scroll past the first viewport
const items = Array.from({ length: 40 }, (_, i) => ({
  id: `item-${i}`, type: 'card', state: 'published', sites: [],
  orderPosition: i, groupId: null, expiresAt: null,
  data: { title: `Card ${i}` }, createdAt: '', updatedAt: '',
}))

// theme = null leaves no saved preference, so useTheme falls back to the
// (stubbed) system colour scheme
function visitAdmin(theme: 'light' | 'dark' | null, systemDark = false) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.visit(ADMIN_URL, {
    onBeforeLoad(win) {
      win.localStorage.setItem('betel-admin-token', mockToken)
      if (theme) win.localStorage.setItem('theme', theme)
      else win.localStorage.removeItem('theme')
      cy.stub(win, 'matchMedia').callsFake((query: string) => ({
        matches: systemDark && query.includes('prefers-color-scheme: dark'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }))
    },
  })
  cy.wait('@me')
}

function bodyBackground() {
  return cy.get('body').then($body => getComputedStyle($body[0]).backgroundColor)
}

describe('Admin — light / dark theme', () => {
  it('uses the light admin palette when the light theme is stored', () => {
    visitAdmin('light')
    cy.get('html').should('have.class', 'admin-theme').and('have.attr', 'data-theme', 'light')
    bodyBackground().should('eq', 'rgb(244, 244, 244)')
  })

  it('uses the dark admin palette when the dark theme is stored', () => {
    visitAdmin('dark')
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    bodyBackground().should('eq', 'rgb(10, 10, 10)')
  })

  it('follows a light system preference when no theme is saved', () => {
    visitAdmin(null, false)
    cy.get('html').should('have.attr', 'data-theme', 'light')
    bodyBackground().should('eq', 'rgb(244, 244, 244)')
  })

  it('follows a dark system preference when no theme is saved', () => {
    visitAdmin(null, true)
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    bodyBackground().should('eq', 'rgb(10, 10, 10)')
  })

  it('toggles between light and dark and remembers the choice', () => {
    visitAdmin('light')
    cy.get('[data-testid="admin-theme-toggle"]').click()
    cy.get('html').should('have.attr', 'data-theme', 'dark')
    cy.window().then(win => expect(win.localStorage.getItem('theme')).to.eq('dark'))
    bodyBackground().should('eq', 'rgb(10, 10, 10)')
  })

  it('grows the admin shell with content that scrolls past the first viewport', () => {
    visitAdmin('light')
    cy.wait('@content')
    cy.contains('Card 39').should('exist')
    cy.document().then(doc => {
      const root = doc.documentElement
      expect(root.scrollHeight).to.be.greaterThan(root.clientHeight)
      // The shell wraps all content instead of stopping at 100vh
      const shell = doc.querySelector('nav')!.parentElement!
      expect(shell.getBoundingClientRect().height).to.be.at.least(root.scrollHeight - 1)
    })
    bodyBackground().should('eq', 'rgb(244, 244, 244)')
  })
})
