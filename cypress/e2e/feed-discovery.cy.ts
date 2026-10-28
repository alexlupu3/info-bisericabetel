/**
 * Spec 02 FR-064(a) — feed readers and agents discover the RSS feed of current and
 * upcoming events from the page head. The static all-sites link lives in index.html;
 * the per-site link on /:siteSlug is server-rendered (registerHeadTags) and is not part
 * of the Vite-served page.
 */
import { stubPublicBasics } from '../support/helpers/public'

const ALTERNATE = 'head link[rel="alternate"][type="application/rss+xml"]'

describe('Feed discovery', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.intercept('GET', '/api/content*', { site: null, items: [] }).as('content')
  })

  it('advertises the all-sites feed on /', () => {
    cy.visit('/')
    cy.wait('@content')
    cy.get(ALTERNATE).should('have.length.at.least', 1)
    cy.get(`${ALTERNATE}[href="/feed.xml"]`)
      .should('have.length', 1)
      .and('have.attr', 'title', 'Evenimente — Betel Info')
  })

  it('keeps the all-sites feed link on a site page and after switching sites', () => {
    cy.visit('/centru')
    cy.wait('@content')
    cy.get(`${ALTERNATE}[href="/feed.xml"]`).should('have.length', 1)

    cy.get('[data-testid="site-switcher-trigger"]').click()
    cy.get('[data-testid="site-tab-vest"]').click()
    cy.location('pathname').should('eq', '/vest')
    cy.get(`${ALTERNATE}[href="/feed.xml"]`).should('have.length', 1)
  })
})
