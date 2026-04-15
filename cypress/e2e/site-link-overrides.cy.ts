/**
 * Per-site link overrides — public app
 *
 * Verifies that cards and posters resolve to the correct link depending on the
 * active site view: site-specific override when on a matching site, default
 * link on the all-sites view or when no override is set for the current site.
 */
const base = {
  state: 'published' as const, sites: [] as string[],
  orderPosition: 0, groupId: null, groupTitle: null,
  expiresAt: null, createdAt: '', updatedAt: '',
}

const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest',   name: 'Vest',   accent: '#22c55e' },
]

beforeEach(() => {
  cy.intercept('GET', '/api/sites', { sites: mockSites })
})

describe('Card — per-site link resolution', () => {
  it('shows the site-specific link when viewing a matching site', () => {
    cy.intercept('GET', '/api/content?site=centru', {
      site: 'centru',
      items: [{
        ...base, id: 'c1', type: 'card',
        data: {
          title: 'Donații',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/centru')
    cy.wait('@content')
    cy.get('a[href="https://betel-centru.ro/donate"][target="_blank"]').should('exist')
    cy.get('a[href="https://betel.ro/donate"]').should('not.exist')
  })

  it('shows the default link on the all-sites view even when overrides exist', () => {
    cy.intercept('GET', '/api/content', {
      site: null,
      items: [{
        ...base, id: 'c2', type: 'card',
        data: {
          title: 'Donații',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')
    cy.get('a[href="https://betel.ro/donate"][target="_blank"]').should('exist')
    cy.get('a[href="https://betel-centru.ro/donate"]').should('not.exist')
  })

  it('falls back to the default link when current site has no override', () => {
    cy.intercept('GET', '/api/content?site=vest', {
      site: 'vest',
      items: [{
        ...base, id: 'c3', type: 'card',
        data: {
          title: 'Donații',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/vest')
    cy.wait('@content')
    cy.get('a[href="https://betel.ro/donate"][target="_blank"]').should('exist')
    cy.get('a[href="https://betel-centru.ro/donate"]').should('not.exist')
  })

  it('shows no link when neither default link nor overrides are set', () => {
    cy.intercept('GET', '/api/content?site=centru', {
      site: 'centru',
      items: [{
        ...base, id: 'c4', type: 'card',
        data: { title: 'Card fără link' },
      }],
    }).as('content')

    cy.visit('/centru')
    cy.wait('@content')
    cy.contains('Card fără link').should('be.visible')
    cy.get('a[target="_blank"] article').should('not.exist')
  })

  it('shows the correct site link for each site when switching between sites', () => {
    cy.intercept('GET', '/api/content?site=centru', {
      site: 'centru',
      items: [{
        ...base, id: 'cs1', type: 'card',
        data: {
          title: 'Donații',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate', vest: 'https://betel-vest.ro/donate' },
        },
      }],
    })
    cy.intercept('GET', '/api/content?site=vest', {
      site: 'vest',
      items: [{
        ...base, id: 'cs1', type: 'card',
        data: {
          title: 'Donații',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate', vest: 'https://betel-vest.ro/donate' },
        },
      }],
    })

    cy.visit('/centru')
    cy.get('a[href="https://betel-centru.ro/donate"]').should('exist')

    cy.visit('/vest')
    cy.get('a[href="https://betel-vest.ro/donate"]').should('exist')
  })
})

describe('Poster — per-site link resolution', () => {
  it('shows the site-specific link when viewing a matching site', () => {
    cy.intercept('GET', '/api/content?site=centru', {
      site: 'centru',
      items: [{
        ...base, id: 'p1', type: 'poster',
        data: {
          imageUrl: '/icons/icon-192.png',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/centru')
    cy.wait('@content')
    cy.get('a[href="https://betel-centru.ro/donate"][target="_blank"] article').should('exist')
    cy.get('a[href="https://betel.ro/donate"]').should('not.exist')
  })

  it('shows the default link on the all-sites view', () => {
    cy.intercept('GET', '/api/content', {
      site: null,
      items: [{
        ...base, id: 'p2', type: 'poster',
        data: {
          imageUrl: '/icons/icon-192.png',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/')
    cy.wait('@content')
    cy.get('a[href="https://betel.ro/donate"][target="_blank"] article').should('exist')
    cy.get('a[href="https://betel-centru.ro/donate"]').should('not.exist')
  })

  it('falls back to the default link when current site has no override', () => {
    cy.intercept('GET', '/api/content?site=vest', {
      site: 'vest',
      items: [{
        ...base, id: 'p3', type: 'poster',
        data: {
          imageUrl: '/icons/icon-192.png',
          link: 'https://betel.ro/donate',
          siteLinks: { centru: 'https://betel-centru.ro/donate' },
        },
      }],
    }).as('content')

    cy.visit('/vest')
    cy.wait('@content')
    cy.get('a[href="https://betel.ro/donate"][target="_blank"] article').should('exist')
    cy.get('a[href="https://betel-centru.ro/donate"]').should('not.exist')
  })
})

export {}
