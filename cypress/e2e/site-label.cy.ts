/**
 * Task 5 — Location indicator for scoped items in "all sites" view
 */

const SITES_FIXTURE = {
  sites: [
    { slug: 'manastur', name: 'Mănăștur', accent: '#17d3c3' },
    { slug: 'centru',   name: 'Centru',   accent: '#ff6200' },
    { slug: 'vest',     name: 'Vest',     accent: '#a0384b' },
    { slug: 'est',      name: 'Est',      accent: '#ffd000' },
  ],
}

const base = {
  state: 'published' as const,
  orderPosition: 0,
  groupId: null,
  groupTitle: null,
  expiresAt: null,
  createdAt: '',
  updatedAt: '',
}

function mockContent(items: object[]) {
  cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  cy.intercept('GET', '/api/languages', {
    languages: [
      { code: 'ro', name: 'Română', isDefault: true, enabled: true },
      { code: 'en', name: 'English', isDefault: false, enabled: true },
    ]
  }).as('languages')
  cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} }).as('translations')
}

describe('Site label — all-sites view', () => {
  describe('shows location label for scoped items', () => {
    it('shows site label under card title when item is scoped to a site', () => {
      mockContent([{
        ...base, id: 'c1', type: 'card',
        sites: ['manastur'],
        data: { title: 'Card Mănăștur' },
      }])
      cy.visit('/')
      cy.contains('Card Mănăștur').should('be.visible')
      cy.get('[data-testid="site-label"]').should('be.visible').and('contain', 'Mănăștur')
    })

    it('shows site label under richtext title when item is scoped', () => {
      mockContent([{
        ...base, id: 'r1', type: 'richtext',
        sites: ['centru'],
        data: { title: 'Anunț Centru', body: 'Corp text.' },
      }])
      cy.visit('/')
      cy.contains('Anunț Centru').should('be.visible')
      cy.get('[data-testid="site-label"]').should('be.visible').and('contain', 'Centru')
    })

    it('shows site label under video title when item is scoped', () => {
      mockContent([{
        ...base, id: 'v1', type: 'video',
        sites: ['vest'],
        data: { youtubeId: 'dQw4w9WgXcQ', title: 'Video Vest' },
      }])
      cy.visit('/')
      cy.contains('Video Vest').should('be.visible')
      cy.get('[data-testid="site-label"]').should('be.visible').and('contain', 'Vest')
    })

    it('shows site label under poster (left-aligned) when item is scoped', () => {
      mockContent([{
        ...base, id: 'p1', type: 'poster',
        sites: ['est'],
        data: { imageUrl: '/icons/icon-192.png', alt: 'Poster Est' },
      }])
      cy.visit('/')
      cy.get('img[alt="Poster Est"]').should('exist')
      cy.get('[data-testid="site-label"]').should('be.visible').and('contain', 'Est')
    })

  })

  describe('does not show label for non-scoped items', () => {
    it('does not show site label when item has empty sites array (all sites)', () => {
      mockContent([{
        ...base, id: 'c3', type: 'card',
        sites: [],
        data: { title: 'Card global' },
      }])
      cy.visit('/')
      cy.contains('Card global').should('be.visible')
      cy.get('[data-testid="site-label"]').should('not.exist')
    })

    it('does not show site label when item is scoped to multiple sites', () => {
      mockContent([{
        ...base, id: 'c2', type: 'card',
        sites: ['manastur', 'centru'],
        data: { title: 'Card mai multe locații' },
      }])
      cy.visit('/')
      cy.contains('Card mai multe locații').should('be.visible')
      cy.get('[data-testid="site-label"]').should('not.exist')
    })
  })

  describe('does not show label when viewing a specific site', () => {
    it('hides site label when user is on a site-specific view', () => {
      cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
      cy.intercept('GET', '/api/languages', {
        languages: [
          { code: 'ro', name: 'Română', isDefault: true, enabled: true },
          { code: 'en', name: 'English', isDefault: false, enabled: true },
        ]
      }).as('languages')
      cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} }).as('translations')
      cy.intercept('GET', '/api/content?site=manastur', {
        site: 'manastur',
        items: [{
          ...base, id: 'c4', type: 'card',
          sites: ['manastur'],
          data: { title: 'Card scoped in site view' },
        }],
      }).as('content')
      cy.visit('/manastur')
      cy.contains('Card scoped in site view').should('be.visible')
      cy.get('[data-testid="site-label"]').should('not.exist')
    })
  })

  describe('site label inside group blocks', () => {
    it('shows site label for scoped items inside a group when in all-sites view', () => {
      mockContent([
        {
          ...base, id: 'gi1', type: 'card',
          sites: ['est'],
          groupId: 'g1', groupTitle: 'Grup localizat',
          data: { title: 'Card în grup Est' },
        },
        {
          ...base, id: 'gi2', type: 'card',
          sites: [],
          groupId: 'g1', groupTitle: 'Grup localizat',
          data: { title: 'Card global în grup' },
        },
      ])
      cy.visit('/')
      cy.contains('Grup localizat').should('be.visible')
      cy.contains('Card în grup Est').should('be.visible')
      // Only the scoped card should show a label
      cy.get('[data-testid="site-label"]').should('have.length', 1).and('contain', 'Est')
    })
  })
})

export {}
