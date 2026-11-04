/**
 * Admin sidebar (spec 09, FR-105 – FR-109): role-aware menu from one definition,
 * expanded / rail with a remembered preference, phone FAB + drawer with its history
 * contract, and toasts that never sit under the FAB.
 */
import { contentItem, stubAdmin, visitAdmin } from '../support/helpers/admin'

const SUPER_LINKS = ['content', 'media', 'archive', 'analytics', 'locations', 'users', 'translations', 'logs', 'error-logs', 'sql']
const ADMIN_LINKS = ['content', 'media', 'archive', 'analytics']
const SUPER_ONLY = SUPER_LINKS.filter(l => !ADMIN_LINKS.includes(l))

function stubPages() {
  cy.intercept('GET', '/api/admin/media*', { media: [] })
}

describe('Admin sidebar — desktop', () => {
  beforeEach(() => stubPages())

  it('super-admin: four labelled groups, ten links, current page marked, no top bar', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'super-admin' })
    visitAdmin('/admin/content')

    cy.get('[data-testid="admin-sidebar"]').should('be.visible')
    cy.get('nav[aria-label="Navigare admin"]').within(() => {
      cy.get('h2').should('have.length', 4).then($h => {
        expect([...$h].map(h => h.textContent)).to.deep.equal(['Conținut', 'Rapoarte', 'Administrare', 'Sistem'])
      })
      SUPER_LINKS.forEach(id => cy.get(`[data-testid="nav-${id}"]`).should('be.visible'))
    })
    cy.get('[data-testid="nav-content"]').should('have.attr', 'aria-current', 'page')
    cy.get('[data-testid="hamburger-btn"]').should('not.exist')
    cy.get('[data-testid="nav-user-role"]').should('have.text', 'Super-admin')

    cy.get('[data-testid="nav-media"]').click()
    cy.location('pathname').should('eq', '/admin/media')
    cy.get('[data-testid="nav-media"]').should('have.attr', 'aria-current', 'page')
    cy.get('[data-testid="nav-content"]').should('not.have.attr', 'aria-current')
  })

  it('regular admin: a flat list of four pages, no headings, email and "Admin" in the footer', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'admin' })
    visitAdmin('/admin/content')

    cy.get('nav[aria-label="Navigare admin"]').within(() => {
      cy.get('h2').should('not.exist')
      cy.get('a[data-testid^="nav-"]').should('have.length', 4)
    })
    ADMIN_LINKS.forEach(id => cy.get(`[data-testid="nav-${id}"]`).should('be.visible'))
    SUPER_ONLY.forEach(id => cy.get(`[data-testid="nav-${id}"]`).should('not.exist'))
    cy.get('[data-testid="nav-user-email"]').should('have.text', 'admin@betel.ro')
    cy.get('[data-testid="nav-user-role"]').should('have.text', 'Admin')
  })

  it('regular admin: a super-admin page URL falls back to Conținut (menu and routes agree)', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'admin' })
    visitAdmin('/admin/users')
    cy.location('pathname').should('eq', '/admin/content')
  })

  it('collapses to a rail, remembers it across reloads and keeps accessible names', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'super-admin' })
    visitAdmin('/admin/content')

    cy.get('[data-testid="sidebar-collapse"]')
      .should('have.attr', 'aria-expanded', 'true')
      .and('have.attr', 'aria-controls', 'admin-sidebar')
      .and('have.attr', 'aria-label', 'Restrânge meniul')
      .click()
    cy.get('[data-testid="sidebar-collapse"]')
      .should('have.attr', 'aria-expanded', 'false')
      .and('have.attr', 'aria-label', 'Extinde meniul')
    cy.get('[data-testid="admin-sidebar"]').invoke('outerWidth').should('be.lte', 72)
    cy.window().its('localStorage').invoke('getItem', 'betel-admin-sidebar').should('eq', 'collapsed')

    cy.reload()
    cy.wait('@me')
    cy.get('[data-testid="admin-sidebar"]').should('have.attr', 'data-state', 'collapsed')
    cy.get('[data-testid="nav-media"]').find('.sr-only').should('have.text', 'Media')

    // The rail tooltip shows the label on hover and on keyboard focus.
    cy.get('[data-testid="nav-media"]').trigger('mouseover')
    cy.get('[data-testid="rail-tooltip"]').should('have.text', 'Media').and('have.attr', 'aria-hidden', 'true')
    cy.get('[data-testid="nav-media"]').trigger('mouseout')
    cy.get('[data-testid="rail-tooltip"]').should('not.exist')
    cy.get('[data-testid="nav-users"]').focus()
    cy.get('[data-testid="rail-tooltip"]').should('have.text', 'Utilizatori')
  })

  it('defaults to a rail from 768 to 1023 px and to expanded from 1024 px', () => {
    stubAdmin({ role: 'admin' })
    cy.viewport(1000, 660)
    visitAdmin('/admin/content')
    cy.get('[data-testid="admin-sidebar"]').should('have.attr', 'data-state', 'collapsed')
    cy.viewport(1280, 800)
    cy.get('[data-testid="admin-sidebar"]').should('have.attr', 'data-state', 'expanded')
  })

  it('a stored preference wins over the width default', () => {
    stubAdmin({ role: 'admin' })
    cy.viewport(1000, 660)
    visitAdmin('/admin/content', { 'betel-admin-sidebar': 'expanded' })
    cy.get('[data-testid="admin-sidebar"]').should('have.attr', 'data-state', 'expanded')
  })

  it('the theme toggle in the sidebar footer switches data-theme', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'admin' })
    visitAdmin('/admin/content')
    cy.document().its('documentElement').invoke('getAttribute', 'data-theme').then(before => {
      cy.get('[data-testid="admin-sidebar"] [data-testid="admin-theme-toggle"]').click()
      cy.document().its('documentElement').invoke('getAttribute', 'data-theme').should('not.eq', before)
    })
  })

  it('links the public hub in a new tab', () => {
    cy.viewport(1280, 800)
    stubAdmin({ role: 'admin' })
    visitAdmin('/admin/content')
    cy.get('[data-testid="nav-public-hub"]')
      .should('have.attr', 'href', '/')
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener')
  })
})

describe('Admin sidebar — phone FAB and drawer', () => {
  beforeEach(() => {
    stubPages()
    cy.viewport(375, 812)
    stubAdmin({ role: 'admin' })
  })

  it('shows the FAB instead of the sidebar; the drawer opens on the current link and navigates', () => {
    visitAdmin('/admin/content')
    cy.get('[data-testid="admin-sidebar"]').should('not.exist')
    cy.get('[data-testid="nav-fab"]').should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .and('have.attr', 'aria-label', 'Deschide meniul')
    cy.get('[data-testid="mobile-header-page"]').should('have.text', 'Conținut')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"]').should('be.visible').and('have.attr', 'aria-label', 'Meniu admin')
    cy.focused().should('have.attr', 'data-testid', 'nav-content')

    // The drawer's × sits exactly where the FAB is.
    cy.get('[data-testid="nav-fab"]').then($fab => {
      const fab = $fab[0].getBoundingClientRect()
      cy.get('[data-testid="nav-drawer-close"]').then($x => {
        const x = $x[0].getBoundingClientRect()
        expect(Math.round(x.left)).to.eq(Math.round(fab.left))
        expect(Math.round(x.top)).to.eq(Math.round(fab.top))
        expect(Math.round(x.width)).to.eq(56)
      })
    })

    cy.get('[data-testid="nav-drawer"] [data-testid="nav-media"]').click()
    cy.location('pathname').should('eq', '/admin/media')
    cy.get('[data-testid="nav-drawer"]').should('not.exist')
    cy.focused().should('have.id', 'admin-main')
  })

  it('Esc, the backdrop and × close the drawer and return focus to the FAB', () => {
    visitAdmin('/admin/content')
    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"]').should('be.visible')
    cy.focused().type('{esc}')
    cy.get('[data-testid="nav-drawer"]').should('not.exist')
    cy.focused().should('have.attr', 'data-testid', 'nav-fab')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"]').click(5, 400)
    cy.get('[data-testid="nav-drawer"]').should('not.exist')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer-close"]').click()
    cy.get('[data-testid="nav-drawer"]').should('not.exist')
    cy.focused().should('have.attr', 'data-testid', 'nav-fab')
    cy.location('pathname').should('eq', '/admin/content')
  })

  it('history: Back closes the drawer without leaving the page; a link replaces the drawer entry; reload never reopens it', () => {
    visitAdmin('/admin/media')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"]').should('be.visible')
    cy.go('back')
    cy.get('[data-testid="nav-drawer"]').should('not.exist')
    cy.location('pathname').should('eq', '/admin/media')
    cy.focused().should('have.attr', 'data-testid', 'nav-fab')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"] [data-testid="nav-content"]').click()
    cy.location('pathname').should('eq', '/admin/content')
    cy.go('back')
    cy.location('pathname').should('eq', '/admin/media')
    cy.get('[data-testid="nav-drawer"]').should('not.exist')

    cy.get('[data-testid="nav-fab"]').click()
    cy.get('[data-testid="nav-drawer"]').should('be.visible')
    cy.reload()
    cy.wait('@me')
    cy.get('[data-testid="nav-fab"]').should('be.visible')
    cy.get('[data-testid="nav-drawer"]').should('not.exist')
  })

  it('the theme toggle works from the drawer', () => {
    visitAdmin('/admin/content')
    cy.document().its('documentElement').invoke('getAttribute', 'data-theme').then(before => {
      cy.get('[data-testid="nav-fab"]').click()
      cy.get('[data-testid="nav-drawer"] [data-testid="admin-theme-toggle"]').click()
      cy.document().its('documentElement').invoke('getAttribute', 'data-theme').should('not.eq', before)
    })
  })

  it('regression (FR-109): a toast sits above the FAB, never under it', () => {
    const created = contentItem('new-1', 'Seară de rugăciune')
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: created }).as('create')
    visitAdmin('/admin/content')
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-title-input"]').type('Seară de rugăciune')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="toast"]').should('be.visible').then($toast => {
      const t = $toast[0].getBoundingClientRect()
      cy.get('[data-testid="nav-fab"]').should('be.visible').then($fab => {
        const f = $fab[0].getBoundingClientRect()
        const overlap = t.left < f.right && f.left < t.right && t.top < f.bottom && f.top < t.bottom
        expect(overlap, 'toast and FAB overlap').to.be.false
      })
    })
  })

  it('regression (FR-109): the last row menu is reachable above the FAB', () => {
    const items = Array.from({ length: 12 }, (_, i) => contentItem(`i${i}`, `Element ${i}`, { orderPosition: i }))
    stubAdmin({ role: 'admin', items })
    visitAdmin('/admin/content')
    cy.scrollTo('bottom')
    // No auto-scroll: the trigger must be clickable where it is after scrolling to the end.
    cy.get('[data-testid="item-menu-trigger-i11"]').click({ scrollBehavior: false })
    cy.get('[data-testid="item-menu-edit-i11"]').should('be.visible')
  })
})
