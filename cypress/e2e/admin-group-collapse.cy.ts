/**
 * Group expand / collapse
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const group1 = {
  id: 'g1', title: 'Anunțuri', sites: [], orderPosition: 0, state: 'draft', createdAt: '', updatedAt: '',
}
const group2 = {
  id: 'g2', title: 'Evenimente', sites: [], orderPosition: 1, state: 'draft', createdAt: '', updatedAt: '',
}
const itemInG1 = {
  id: 'i1', type: 'richtext', state: 'draft', sites: [], orderPosition: 0,
  groupId: 'g1', expiresAt: null, data: { title: 'Anunț 1' }, createdAt: '', updatedAt: '',
}
const itemInG2 = {
  id: 'i2', type: 'richtext', state: 'draft', sites: [], orderPosition: 0,
  groupId: 'g2', expiresAt: null, data: { title: 'Eveniment 1' }, createdAt: '', updatedAt: '',
}

function setup(items = [itemInG1, itemInG2], groups = [group1, group2]) {
  cy.intercept('GET', '/api/auth/me', mockUser)
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] })
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@content')
  cy.wait('@groups')
}

// ── Toggle button presence ──────────────────────────────────────────────────────

describe('Group collapse toggle button', () => {
  beforeEach(() => setup())

  it('shows a collapse toggle button next to each group name', () => {
    cy.get('[data-testid="collapse-toggle-g1"]').should('be.visible')
    cy.get('[data-testid="collapse-toggle-g2"]').should('be.visible')
  })

  it('groups are collapsed by default (items not visible)', () => {
    cy.get('[data-testid="container-g1"]').should('not.exist')
    cy.get('[data-testid="content-row-i1"]').should('not.exist')
  })
})

// ── Expand single group ─────────────────────────────────────────────────────────

describe('Expand a single group', () => {
  beforeEach(() => setup())

  it('shows the item list when expanded', () => {
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="container-g1"]').should('be.visible')
    cy.get('[data-testid="content-row-i1"]').should('be.visible')
  })

  it('keeps other groups collapsed', () => {
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="container-g2"]').should('not.exist')
    cy.get('[data-testid="content-row-i2"]').should('not.exist')
  })

  it('re-collapses when toggled again', () => {
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="container-g1"]').should('be.visible')
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="container-g1"]').should('not.exist')
    cy.get('[data-testid="content-row-i1"]').should('not.exist')
  })
})

// ── Drag handle remains when collapsed ─────────────────────────────────────────

describe('Group drag handle is always present', () => {
  beforeEach(() => setup())

  it('drag handle is visible when group is collapsed', () => {
    cy.get('[data-testid="group-block-g1"]').find('[aria-label="Reordonează grup"]').should('be.visible')
  })

  it('drag handle is still visible when group is expanded', () => {
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="group-block-g1"]').find('[aria-label="Reordonează grup"]').should('be.visible')
  })
})

// ── Toggle all groups button ────────────────────────────────────────────────────

describe('Toggle all groups button', () => {
  it('is shown when groups exist', () => {
    setup()
    cy.get('[data-testid="toggle-all-groups-btn"]').should('be.visible')
  })

  it('is not shown when there are no groups', () => {
    setup([], [])
    cy.get('[data-testid="toggle-all-groups-btn"]').should('not.exist')
  })

  it('expands all groups when clicked and all are collapsed', () => {
    setup()
    cy.get('[data-testid="toggle-all-groups-btn"]').click()
    cy.get('[data-testid="container-g1"]').should('be.visible')
    cy.get('[data-testid="container-g2"]').should('be.visible')
  })

  it('collapses all groups when clicked and all are expanded', () => {
    setup()
    cy.get('[data-testid="toggle-all-groups-btn"]').click() // expand all
    cy.get('[data-testid="toggle-all-groups-btn"]').click() // collapse all
    cy.get('[data-testid="container-g1"]').should('not.exist')
    cy.get('[data-testid="container-g2"]').should('not.exist')
  })

  it('collapses all groups even when only some are expanded', () => {
    setup()
    cy.get('[data-testid="collapse-toggle-g1"]').click() // expand only g1 (g2 stays collapsed)
    cy.get('[data-testid="toggle-all-groups-btn"]').click() // not all collapsed → collapse all
    cy.get('[data-testid="container-g1"]').should('not.exist')
    cy.get('[data-testid="container-g2"]').should('not.exist')
  })
})

// ── Collapsed groups don't receive drops ───────────────────────────────────────

describe('Collapsed groups cannot receive dropped items', () => {
  const standaloneItem = {
    id: 's1', type: 'richtext', state: 'draft', sites: [], orderPosition: 10,
    groupId: null, expiresAt: null, data: { title: 'Standalone' }, createdAt: '', updatedAt: '',
  }

  function dragHandle(testId: string, deltaY: number) {
    cy.get(`[data-testid="${testId}"]`).then($handle => {
      const rect = $handle[0].getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      cy.wrap($handle).trigger('pointerdown', { button: 0, clientX: cx, clientY: startY, isPrimary: true, force: true })
      cy.get('body').trigger('pointermove', { clientX: cx, clientY: startY + 5, isPrimary: true })
      cy.get('body').trigger('pointermove', { clientX: cx, clientY: startY + deltaY, isPrimary: true })
      cy.get('body').trigger('pointerup',   { clientX: cx, clientY: startY + deltaY, isPrimary: true })
    })
  }

  it('does not call content/order when dragging over a collapsed group', () => {
    setup([standaloneItem, itemInG1], [group1])
    cy.intercept('PUT', '/api/admin/content/root-order', { items: [], groups: [] }).as('rootOrder')

    let groupOrderCalled = false
    cy.intercept('PUT', '/api/admin/content/order', req => {
      groupOrderCalled = true
      req.reply({ items: [] })
    })

    // group1 is collapsed by default — no need to click the toggle

    // drag the standalone item upward (toward the collapsed group which is above it)
    dragHandle('drag-handle-s1', -80)

    cy.wait('@rootOrder').then(() => {
      expect(groupOrderCalled).to.be.false
    })
  })
})
