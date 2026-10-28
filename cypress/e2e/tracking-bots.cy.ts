/**
 * Spec 03 FR-074 — crawler visits are not counted as `site_visit` analytics.
 */
import { stubPublicBasics } from '../support/helpers/public'

function visitAs(userAgent: string | null, webdriver: boolean) {
  cy.visit('/', {
    onBeforeLoad(win) {
      Object.defineProperty(win.navigator, 'webdriver', { get: () => webdriver, configurable: true })
      if (userAgent) Object.defineProperty(win.navigator, 'userAgent', { get: () => userAgent, configurable: true })
      win.localStorage.clear()
    },
  })
}

describe('Analytics skip crawlers', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.intercept('GET', '/api/content*', { site: null, items: [] }).as('content')
    cy.intercept('POST', '/api/events', cy.spy().as('trackRequest'))
  })

  it('does not record a site_visit for an automated browser (navigator.webdriver)', () => {
    visitAs(null, true)
    cy.wait('@content')
    cy.get('[data-testid="content-empty"]').should('be.visible')
    cy.wait(300)
    cy.get('@trackRequest').should('not.have.been.called')
  })

  it('does not record a site_visit for a crawler user agent', () => {
    visitAs('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', false)
    cy.wait('@content')
    cy.wait(300)
    cy.get('@trackRequest').should('not.have.been.called')
  })

  it('still records a site_visit for a regular visitor', () => {
    visitAs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', false)
    cy.wait('@content')
    cy.get('@trackRequest').should('have.been.calledOnce')
  })
})
