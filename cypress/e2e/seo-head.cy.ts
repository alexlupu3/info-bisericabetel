/**
 * Spec 03 FR-067 — the SPA keeps <title> and <link rel="canonical"> in sync with the
 * page, using the same title rule (packages/shared/src/seo.ts) the server renders.
 */
import { stubPublicBasics } from '../support/helpers/public'

describe('SEO head — title and canonical', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.intercept('GET', '/api/content*', { site: null, items: [] }).as('content')
  })

  it('uses the hub title and canonical on /', () => {
    cy.visit('/')
    cy.title().should('eq', 'Betel Info – Biserica Baptistă Betel')
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('match', /\/$/)
  })

  it('uses the site title and canonical on /centru', () => {
    cy.visit('/centru')
    cy.title().should('eq', 'Centru – Biserica Baptistă Betel')
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('match', /\/centru$/)
  })

  it('updates both when switching sites', () => {
    cy.visit('/')
    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-vest"]').click()
    cy.title().should('eq', 'Vest – Biserica Baptistă Betel')
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('match', /\/vest$/)

    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-all"]').click()
    cy.title().should('eq', 'Betel Info – Biserica Baptistă Betel')
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('match', /:\d+\/$|\.[a-z]+\/$/)
  })
})
