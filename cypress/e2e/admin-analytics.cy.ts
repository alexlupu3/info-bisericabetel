const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
]

function loginAndGo(path: string) {
  cy.intercept('GET', '/api/auth/me', mockUser)
  cy.intercept('GET', '/api/sites', { sites: mockSites })
  cy.intercept('GET', '/api/admin/content', { items: [] })
  cy.intercept('GET', '/api/admin/groups', { groups: [] })
  cy.visit(ADMIN_URL + path, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem('betel-admin-token', mockToken)
    },
  })
}

// Mock overview data
const mockOverview = {
  period: 'week',
  current: {
    views: 275,
    clicks: 120,
    series: Array.from({ length: 7 }, (_, i) => ({
      label: `2026-04-${String(13 + i).padStart(2, '0')}`,
      views: 30 + i * 5,
      clicks: 10 + i * 3,
    })),
  },
  previous: {
    views: 222,
    clicks: 107,
    series: Array.from({ length: 7 }, (_, i) => ({
      label: `2026-04-${String(6 + i).padStart(2, '0')}`,
      views: 25 + i * 4,
      clicks: 8 + i * 3,
    })),
  },
  viewsChange: 24,
  clicksChange: 12,
}

const mockItems = {
  items: [
    { itemId: 'item-1', type: 'card', title: 'Program Duminică', clicks: 45 },
    { itemId: 'item-2', type: 'poster', title: 'Conferință Mai', clicks: 32 },
  ],
}

const mockItemDaily = {
  itemId: 'item-1',
  daily: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-04-${String(6 + i).padStart(2, '0')}`,
    clicks: 2 + Math.floor(Math.random() * 5),
  })),
}

describe('Admin — Analytics dashboard', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/admin/analytics/overview*', mockOverview).as('overview')
    cy.intercept('GET', '/api/admin/analytics/items', mockItems).as('items')
    cy.intercept('GET', '/api/admin/analytics/items/*/daily', mockItemDaily).as('itemDaily')
    loginAndGo('analytics')
  })

  it('shows the analytics page with stats and chart', () => {
    cy.wait('@overview')
    cy.get('[data-testid="period-selector"]').should('be.visible')
    cy.get('[data-testid="stat-card-vizualizri"]').should('contain', '275')
    cy.get('[data-testid="stat-card-clickuri"]').should('contain', '120')
    cy.get('[data-testid="trend-chart"]').should('be.visible')
  })

  it('switches period using period selector', () => {
    cy.wait('@overview')
    cy.get('[data-testid="period-day"]').click()
    cy.wait('@overview')
    cy.get('[data-testid="period-month"]').click()
    cy.wait('@overview')
  })

  it('toggles chart metric by clicking stat cards', () => {
    cy.wait('@overview')
    // Click the Clickuri card to switch metric
    cy.get('[data-testid="stat-card-clickuri"]').click()
    // The clicks card should now be active (has accent border)
    cy.get('[data-testid="stat-card-clickuri"]').should('have.class', 'border-l-2')
  })

  it('shows items table and opens item detail modal', () => {
    cy.wait(['@overview', '@items'])
    cy.get('[data-testid="items-table"]').should('be.visible')
    cy.get('[data-testid="items-table"]').should('contain', 'Program Duminică')
    cy.get('[data-testid="items-table"]').should('contain', '45')

    // Click first row to open modal
    cy.get('[data-testid="items-table"] tbody tr').first().click()
    cy.wait('@itemDaily')
    cy.get('[data-testid="item-daily-modal"]').should('be.visible')
    cy.get('[data-testid="item-daily-modal"]').should('contain', 'Program Duminică')
  })

  it('closes item detail modal by clicking backdrop', () => {
    cy.wait(['@overview', '@items'])
    cy.get('[data-testid="items-table"] tbody tr').first().click()
    cy.wait('@itemDaily')
    cy.get('[data-testid="item-daily-modal"]').should('be.visible')
    // Click the backdrop (the outer div)
    cy.get('[data-testid="item-daily-modal"]').click({ force: true })
    cy.get('[data-testid="item-daily-modal"]').should('not.exist')
  })
})
