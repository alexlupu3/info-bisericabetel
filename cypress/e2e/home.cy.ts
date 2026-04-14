/**
 * Increment 1 + 2 — Public PWA: home page, site switcher, content feed
 */
const SITES_FIXTURE = {
  sites: [
    { slug: 'manastur', name: 'Mănăștur', accent: '#17d3c3' },
    { slug: 'centru',   name: 'Centru',   accent: '#ff6200' },
    { slug: 'vest',     name: 'Vest',     accent: '#a0384b' },
    { slug: 'est',      name: 'Est',      accent: '#ffd000' },
  ],
}

const EMPTY_CONTENT = { site: null, items: [] }

describe('Home page', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
    cy.intercept('GET', '/api/content*', EMPTY_CONTENT).as('content')
    cy.visit('/')
  })

  it('renders the Betel hero title', () => {
    cy.contains('BETEL').should('be.visible')
    cy.title().should('eq', 'Betel Info')
  })

  it('renders the Betel logo in the hero header', () => {
    cy.get('img.betel-logo').should('be.visible').and('have.attr', 'src', '/icons/favicon-dark.svg')
  })

  it('renders the hero subtitle', () => {
    cy.get('[data-testid="hero-subtitle"]')
      .should('be.visible')
      .and('contain', 'Rămâi la curent cu programul și activitățile bisericii Betel')
  })

  it('renders the website link below the subtitle', () => {
    cy.get('[data-testid="hero-website-link"]')
      .should('be.visible')
      .and('have.attr', 'href', 'https://bisericabetel.com')
      .and('contain', 'bisericabetel.com')
  })

  it('renders the site switcher with all locations', () => {
    cy.get('[data-testid="site-switcher-trigger"]').should('be.visible').click()
    cy.get('[data-testid="site-tab-all"]').should('be.visible').and('contain', 'Toate')
    cy.get('[data-testid="site-tab-manastur"]').should('be.visible').and('contain', 'Mănăștur')
    cy.get('[data-testid="site-tab-centru"]').should('be.visible').and('contain', 'Centru')
    cy.get('[data-testid="site-tab-vest"]').should('be.visible').and('contain', 'Vest')
    cy.get('[data-testid="site-tab-est"]').should('be.visible').and('contain', 'Est')
  })

  it('navigates to a site-specific URL when a tab is selected', () => {
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-manastur"]').click()
    cy.url().should('include', '/manastur')
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-manastur"]').should('have.attr', 'aria-pressed', 'true')
  })

  it('navigates back to all-sites when Toate is clicked', () => {
    cy.visit('/centru')
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-all"]').click()
    cy.url().should('eq', Cypress.config('baseUrl') + '/')
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-all"]').should('have.attr', 'aria-pressed', 'true')
  })

  it('deep-links to Centru via URL (/centru)', () => {
    cy.visit('/centru')
    cy.get('[data-testid="site-switcher-trigger"]').should('contain', 'Centru')
    cy.contains('CENTRU').should('be.visible')
  })

  it('shows loading skeleton then empty state when API returns no items', () => {
    cy.get('[data-testid="content-feed"]').should('exist')
    cy.get('[data-testid="content-empty"]').should('be.visible')
  })

  it('requests site-scoped content when a site tab is selected', () => {
    cy.intercept('GET', '/api/content?site=vest', { site: 'vest', items: [] }).as('vestContent')
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-vest"]').click()
    cy.wait('@vestContent')
  })

  it('shows content list when API returns items', () => {
    cy.intercept('GET', '/api/content*', {
      site: null,
      items: [
        {
          id: 'test-1', type: 'richtext', state: 'published',
          sites: [], orderPosition: 0, groupId: null, groupTitle: null,
          expiresAt: null, data: { body: 'Test mesaj.' }, createdAt: '', updatedAt: '',
        },
      ],
    }).as('contentWithItem')
    cy.visit('/')
    cy.get('[data-testid="content-list"]').should('exist')
    cy.contains('Test mesaj.').should('be.visible')
  })

  it('shows error state when API fails', () => {
    cy.intercept('GET', '/api/content*', { statusCode: 500 }).as('contentError')
    cy.visit('/')
    cy.get('[data-testid="content-error"]').should('be.visible')
  })
})

export {}
