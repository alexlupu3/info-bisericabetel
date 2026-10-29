/**
 * Spec 03 FR-069 — per-item page /i/:itemId: the item in its site context, a <time>
 * element, the site link, the back-to-hub link, and a not-found state.
 */
import { baseItem, stubPublicBasics } from '../support/helpers/public'

const datedCard = {
  ...baseItem,
  id: '11111111-1111-4111-8111-111111111111',
  type: 'card',
  exclusiveSite: 'centru',
  data: {
    title: 'Concert de seară',
    description: 'Un concert **special** în sala mare.',
    startDate: '2099-11-14',
    startTime: '18:00',
  },
}

describe('Item page /i/:itemId', () => {
  beforeEach(() => {
    stubPublicBasics()
  })

  it('renders a dated card with its site context and links', () => {
    cy.intercept('GET', `/api/content/${datedCard.id}*`, { item: datedCard }).as('item')
    cy.visit(`/i/${datedCard.id}`)
    cy.wait('@item')

    cy.get('h1').should('have.length', 1).and('contain', 'CENTRU')
    cy.get('[data-testid="item-page"]').within(() => {
      cy.get('h2').should('contain', 'Concert de seară')
      cy.get('time[datetime="2099-11-14T18:00:00+02:00"]').should('contain', '14 noiembrie')
      cy.contains('special').should('be.visible')
    })
    cy.get('[data-testid="site-address-centru"]').within(() => {
      cy.get('a[href="/centru"]').should('contain', 'Centru')
      cy.contains('Str. Centrală 1, Cluj-Napoca')
    })
    cy.get('[data-testid="item-back-link"]').should('have.attr', 'href', '/centru')
    cy.title().should('eq', 'Concert de seară – Centru')
    cy.get('link[rel="canonical"]').should('have.attr', 'href').and('match', new RegExp(`/i/${datedCard.id}$`))
  })

  it('goes back to the hub of the item\'s site', () => {
    cy.intercept('GET', `/api/content/${datedCard.id}*`, { item: datedCard }).as('item')
    cy.intercept('GET', '/api/content?site=centru', { site: 'centru', items: [] }).as('centruContent')
    cy.visit(`/i/${datedCard.id}`)
    cy.get('[data-testid="item-back-link"]').click()
    cy.location('pathname').should('eq', '/centru')
    cy.wait('@centruContent')
  })

  it('links an item without a single site back to /', () => {
    const general = { ...datedCard, id: '22222222-2222-4222-8222-222222222222', exclusiveSite: null, sites: [] }
    cy.intercept('GET', `/api/content/${general.id}*`, { item: general }).as('item')
    cy.visit(`/i/${general.id}`)
    cy.get('h1').should('contain', 'BISERICA')
    cy.get('[data-testid="item-back-link"]').should('have.attr', 'href', '/')
    cy.title().should('eq', 'Concert de seară – Biserica Baptistă Betel')
  })

  it('shows the not-found state for an unknown id', () => {
    cy.intercept('GET', '/api/content/does-not-exist*', { statusCode: 404, body: { error: 'Not Found' } }).as('item')
    cy.visit('/i/does-not-exist')
    cy.wait('@item')
    cy.get('[data-testid="item-not-found"]').should('be.visible').and('contain', 'nu mai este disponibilă')
    cy.get('[data-testid="item-not-found-back-link"]').should('have.attr', 'href', '/')
  })
})
