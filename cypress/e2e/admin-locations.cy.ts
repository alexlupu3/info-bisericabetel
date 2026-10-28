/**
 * Spec 03 T8 — structured site address on the Locations page (super-admin). The fields
 * feed each site's schema.org Church / Event location markup.
 */
const mockSuperAdmin = { id: 'u1', email: 'admin@betel.ro', role: 'super-admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const centru = {
  slug: 'centru', name: 'Centru', accent: '#ff6200', address: 'Str. Centrală 1',
  streetAddress: null, postalCode: null, addressLocality: null, addressRegion: null, addressCountry: null,
  latitude: null, longitude: null, telephone: null, email: null,
}

describe('Admin — Locations: structured address', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/auth/me', mockSuperAdmin).as('me')
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/admin/languages', { languages: [] })
    cy.intercept('GET', '/api/sites', { sites: [centru] }).as('sites')
    cy.visit('/admin/locations', {
      onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
  })

  it('saves the structured address fields and shows them', () => {
    const updated = {
      ...centru, streetAddress: 'Str. Exemplu 1', postalCode: '400000', addressLocality: 'Cluj-Napoca',
      addressCountry: 'RO', latitude: 46.77, longitude: 23.59, telephone: '+40 700 000 000',
    }
    cy.intercept('PATCH', '/api/admin/sites/centru', updated).as('patch')

    cy.get('[data-testid="site-card-centru"]').within(() => {
      cy.contains('Editează').click()
      cy.contains('Adresă structurată (opțional)').should('be.visible')
      cy.get('[data-testid="site-streetAddress-input"]').type('Str. Exemplu 1')
      cy.get('[data-testid="site-postalCode-input"]').type('400000')
      cy.get('[data-testid="site-addressLocality-input"]').type('Cluj-Napoca')
      cy.get('[data-testid="site-addressCountry-input"]').type('RO')
      cy.get('[data-testid="site-latitude-input"]').type('46.77')
      cy.get('[data-testid="site-longitude-input"]').type('23.59')
      cy.get('[data-testid="site-telephone-input"]').type('+40 700 000 000')
    })
    cy.intercept('GET', '/api/sites', { sites: [updated] }).as('sitesAfter')
    cy.get('[data-testid="site-card-centru"]').contains('Salvează').click()

    cy.wait('@patch').its('request.body').should(body => {
      expect(body).to.include({
        address: 'Str. Centrală 1', streetAddress: 'Str. Exemplu 1', postalCode: '400000',
        addressLocality: 'Cluj-Napoca', addressCountry: 'RO', latitude: '46.77', longitude: '23.59',
        telephone: '+40 700 000 000', addressRegion: null, email: null,
      })
    })
    cy.get('[data-testid="site-centru-streetAddress"]').should('contain', 'Str. Exemplu 1')
    cy.get('[data-testid="site-centru-telephone"]').should('contain', '+40 700 000 000')
  })

  it('shows the API validation error', () => {
    cy.intercept('PATCH', '/api/admin/sites/centru', {
      statusCode: 400, body: { error: 'latitude must be a number between -90 and 90' },
    }).as('patch')
    cy.get('[data-testid="site-card-centru"]').within(() => {
      cy.contains('Editează').click()
      cy.get('[data-testid="site-latitude-input"]').type('123')
      cy.get('[data-testid="site-longitude-input"]').type('23')
      cy.contains('Salvează').click()
    })
    cy.wait('@patch')
    cy.contains('latitude must be a number between -90 and 90').should('be.visible')
  })
})

export {}
