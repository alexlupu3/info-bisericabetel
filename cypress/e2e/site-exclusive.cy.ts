/**
 * Public-side coverage for the site-exclusive content feature.
 *
 * The API performs the actual filtering (hiding exclusives from the all-sites
 * view, surfacing them only on their own site). These tests verify that the
 * client requests the right URL per route and renders whatever the API returns.
 */

const SITES_FIXTURE = {
  sites: [
    { slug: 'centru', name: 'Centru', accent: '#ff6200' },
    { slug: 'vest',   name: 'Vest',   accent: '#a0384b' },
  ],
}

const baseItem = {
  state: 'published', orderPosition: 0, groupId: null, groupTitle: null,
  expiresAt: null, createdAt: '', updatedAt: '',
}

const generalItem = {
  ...baseItem,
  id: 'general-1', type: 'richtext',
  sites: [], exclusiveSite: null,
  data: { body: 'Mesaj general pentru toți.' },
}

const exclusiveCentruItem = {
  ...baseItem,
  id: 'centru-only-1', type: 'richtext',
  sites: [], exclusiveSite: 'centru',
  data: { body: 'Doar pentru Centru.' },
}

describe('Public — site-exclusive content', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')

    // Single handler that branches on req.query.site, mirroring how the
    // backend would filter exclusives.
    cy.intercept('GET', '/api/content*', req => {
      const site = req.query.site as string | undefined
      if (!site) {
        // All-sites view: API hides exclusives.
        req.reply({ site: null, items: [generalItem] })
      } else if (site === 'centru') {
        req.reply({ site: 'centru', items: [generalItem, exclusiveCentruItem] })
      } else {
        // e.g. vest — does not see centru-exclusive.
        req.reply({ site, items: [generalItem] })
      }
    }).as('content')
  })

  it('all-sites view requests /api/content with no site param and shows non-exclusive items', () => {
    cy.visit('/')
    cy.wait('@content').its('request.url').should('match', /\/api\/content(\?|$)/).and('not.include', 'site=')
    cy.get('[data-testid="content-list"]').should('exist')
    cy.contains('Mesaj general pentru toți.').should('be.visible')
    cy.contains('Doar pentru Centru.').should('not.exist')
  })

  it('site-specific view requests /api/content?site=centru and shows the exclusive item', () => {
    cy.visit('/centru')
    cy.wait('@content').its('request.url').should('include', 'site=centru')
    cy.get('[data-testid="content-list"]').should('exist')
    cy.contains('Mesaj general pentru toți.').should('be.visible')
    cy.contains('Doar pentru Centru.').should('be.visible')
  })

  it('other-site view does not show items exclusive to a different site', () => {
    cy.visit('/vest')
    cy.wait('@content').its('request.url').should('include', 'site=vest')
    cy.get('[data-testid="content-list"]').should('exist')
    cy.contains('Mesaj general pentru toți.').should('be.visible')
    cy.contains('Doar pentru Centru.').should('not.exist')
  })
})

export {}
