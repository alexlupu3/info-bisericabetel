const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

const mockItem = {
  id: 'item-1',
  type: 'card',
  state: 'published',
  sites: [],
  exclusiveSite: null,
  orderPosition: 0,
  groupId: null,
  expiresAt: null,
  data: {
    title: 'Program Duminică',
    link: 'https://betel.ro/program',
    siteLinks: { centru: 'https://betel.ro/centru/program' },
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const mockShortLink1 = {
  id: 'sl-1',
  code: 'abc123',
  label: 'WhatsApp Manastur',
  contentItemId: 'item-1',
  siteSlug: null,
  createdAt: '2026-01-01T00:00:00Z',
  clickCount: 12,
  previewMode: 'content',
  // Fields added by spec 05 (shared short-link service); the tab must tolerate them.
  url: 'https://info.bisericabetel.com/s/abc123',
  itemTitle: 'Program Duminică',
}

const mockShortLink2 = {
  id: 'sl-2',
  code: 'def456',
  label: 'QR cod intrare',
  contentItemId: 'item-1',
  siteSlug: 'centru',
  createdAt: '2026-01-02T00:00:00Z',
  clickCount: 5,
  previewMode: 'content',
  url: 'https://info.bisericabetel.com/s/def456',
  itemTitle: 'Program Duminică',
}

// POST response shape since spec 05: the list fields plus the resolved destination.
const createdShortLink1 = {
  ...mockShortLink1,
  clickCount: 0,
  destination: 'https://betel.ro/program',
}

const mockPreview = {
  mode: 'content',
  willPreview: true,
  reason: null,
  locale: 'ro',
  siteName: 'Betel Info',
  title: 'Program Duminică',
  description: 'Duminică, 9 noiembrie, 10:00',
  imageUrl: 'https://info.bisericabetel.com/uploads/og/0b6c1f3e-9d2a-4c55-8f0e-3a1b2c3d4e5f.jpg',
  imageWidth: 1200,
  imageHeight: 630,
  url: 'https://info.bisericabetel.com/s/abc123',
  destination: 'https://betel.ro/program',
}

const langRo = { code: 'ro', name: 'Română', enabled: true, isDefault: true, createdAt: '2026-01-01T00:00:00Z' }
const langEn = { code: 'en', name: 'English', enabled: true, isDefault: false, createdAt: '2026-01-01T00:00:00Z' }

function setup(languages: unknown[] = []) {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [mockItem] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.intercept('GET', '/api/admin/languages', { languages }).as('languages')
  cy.intercept('GET', '/api/admin/content/*/translations', { translations: [] }).as('translations')
  cy.visit(ADMIN_URL, {
    onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
  })
  cy.wait('@me')
}

function openShortLinksTab() {
  cy.get(`[data-testid="content-name-item-1"]`).click()
  cy.get('[data-testid="tab-short-links"]').click()
}

describe('Admin — Short Links tab', () => {
  beforeEach(setup)

  it('shows the Short Links tab when editing a content item', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.get(`[data-testid="content-name-item-1"]`).click()
    cy.get('[data-testid="tab-edit"]').should('be.visible')
    cy.get('[data-testid="tab-short-links"]').should('be.visible')
  })

  it('opens the Short Links tab and shows empty state', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    openShortLinksTab()
    cy.wait('@shortLinks')
    cy.contains('Niciun link scurt').should('be.visible')
  })

  it('displays existing short links with click counts', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [mockShortLink1, mockShortLink2],
    }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.get(`[data-testid="short-link-row-sl-1"]`).should('contain', 'WhatsApp Manastur')
    cy.get(`[data-testid="short-link-row-sl-1"]`).should('contain', '12')
    cy.get(`[data-testid="short-link-row-sl-2"]`).should('contain', 'QR cod intrare')
    cy.get(`[data-testid="short-link-row-sl-2"]`).should('contain', '5')
  })

  it('creates a new short link with a label', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.intercept('POST', '/api/admin/content/*/short-links', {
      statusCode: 201,
      body: createdShortLink1,
    }).as('create')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').type('WhatsApp Manastur')

    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [{ ...mockShortLink1, clickCount: 0 }],
    }).as('shortLinksRefetch')

    cy.get('[data-testid="short-link-create-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { label: 'WhatsApp Manastur' })
    cy.wait('@shortLinksRefetch')
    cy.get('[data-testid="short-link-row-sl-1"]').should('be.visible')
  })

  it('shows site override dropdown when item has site links', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    // The item has siteLinks.centru defined, so the dropdown should appear
    cy.get('[data-testid="short-link-site-select"]').should('be.visible')
    cy.get('[data-testid="short-link-site-select"]').should('contain', 'Centru')
    // Vest has no siteLinks override on the item, so it must not appear
    cy.get('[data-testid="short-link-site-select"]').should('not.contain', 'Vest')
  })

  it('creates a short link with a site override', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
    cy.intercept('POST', '/api/admin/content/*/short-links', {
      statusCode: 201,
      body: { ...mockShortLink2, clickCount: 0, destination: 'https://betel.ro/centru/program' },
    }).as('create')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').type('QR cod intrare')
    cy.get('[data-testid="short-link-site-select"]').select('centru')

    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [{ ...mockShortLink2, clickCount: 0 }],
    }).as('shortLinksRefetch')

    cy.get('[data-testid="short-link-create-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { siteSlug: 'centru' })
  })

  it('copies the short link of a row (regression: extra url/itemTitle fields)', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [mockShortLink1],
    }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.window().then(win => {
      cy.stub(win.navigator.clipboard, 'writeText').as('writeText').resolves()
    })
    cy.get('[data-testid="short-link-row-sl-1"]').within(() => {
      cy.get('button[aria-label="Copiază link"]').click()
    })
    // The API's absolute url (PUBLIC_BASE_URL) wins over window.location.origin.
    cy.get('@writeText').should('have.been.calledOnceWith', 'https://info.bisericabetel.com/s/abc123')
    cy.contains('Link copiat').should('be.visible')
  })

  it('deletes a short link after confirmation', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', {
      shortLinks: [mockShortLink1],
    }).as('shortLinks')
    cy.intercept('DELETE', '/api/admin/content/*/short-links/sl-1', {
      statusCode: 204,
    }).as('delete')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinksRefetch')

    cy.window().then(win => cy.stub(win, 'confirm').returns(true))
    cy.get('[data-testid="short-link-delete-sl-1"]').click()
    cy.wait('@delete')
    cy.wait('@shortLinksRefetch')
    cy.contains('Niciun link scurt').should('be.visible')
  })

  it('disables create button when label is empty', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-create-btn"]').should('be.disabled')
    cy.get('[data-testid="short-link-label-input"]').type('x')
    cy.get('[data-testid="short-link-create-btn"]').should('not.be.disabled')
  })

  it('cancels creation form without making a request', () => {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')

    openShortLinksTab()
    cy.wait('@shortLinks')

    cy.contains('+ Link nou').click()
    cy.get('[data-testid="short-link-label-input"]').should('be.visible')
    cy.contains('Anulează').first().click()
    cy.get('[data-testid="short-link-label-input"]').should('not.exist')
  })
})

describe('Admin — Short Links tab, link previews', () => {
  function openWithLinks(links: unknown[] = [mockShortLink1]) {
    cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: links }).as('shortLinks')
    openShortLinksTab()
    cy.wait('@shortLinks')
  }

  function interceptPreview(body: object = mockPreview) {
    cy.intercept('GET', '/api/admin/content/*/short-links/*/preview*', body).as('preview')
  }

  describe('with one language', () => {
    beforeEach(() => setup([langRo]))

    it('expands a row into a share-card preview', () => {
      interceptPreview()
      openWithLinks()
      cy.get('[data-testid="short-link-preview-sl-1"]').should('not.exist')
      cy.get('[data-testid="short-link-preview-toggle-sl-1"]').should('contain', 'Previzualizare').click()
      cy.wait('@preview')
      cy.get('[data-testid="short-link-preview-sl-1"]').within(() => {
        cy.get('img').should('have.attr', 'src').and('match', /\/uploads\/og\/[0-9a-f-]+\.jpg$/)
        cy.contains('Program Duminică').should('be.visible')
        cy.contains('Duminică, 9 noiembrie, 10:00').should('be.visible')
        cy.contains(/info\.bisericabetel\.com/i).should('be.visible')
        cy.get('input[type="radio"][value="content"]').should('be.checked')
        cy.get('input[type="radio"][value="destination"]').should('not.be.checked')
      })
      // A single enabled language: no locale selector, no copy variants.
      cy.get('[data-testid="short-link-preview-locale"]').should('not.exist')
      cy.get('button[aria-label="Copiază link (EN)"]').should('not.exist')
    })

    it('creates a short link with the destination preview mode', () => {
      cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
      cy.intercept('POST', '/api/admin/content/*/short-links', {
        statusCode: 201,
        body: { ...createdShortLink1, previewMode: 'destination' },
      }).as('create')
      openShortLinksTab()
      cy.wait('@shortLinks')

      cy.contains('+ Link nou').click()
      cy.get('[data-testid="short-link-preview-mode"]').within(() => {
        cy.contains('Previzualizare la partajare').should('be.visible')
        cy.get('input[value="content"]').should('be.checked')
        cy.contains('Pagina destinație').click()
      })
      cy.get('[data-testid="short-link-label-input"]').type('Formular')
      cy.get('[data-testid="short-link-create-btn"]').click()
      cy.wait('@create').its('request.body')
        .should('deep.include', { label: 'Formular', previewMode: 'destination' })
    })

    it('creates a short link with the content mode by default', () => {
      cy.intercept('GET', '/api/admin/content/*/short-links', { shortLinks: [] }).as('shortLinks')
      cy.intercept('POST', '/api/admin/content/*/short-links', { statusCode: 201, body: createdShortLink1 }).as('create')
      openShortLinksTab()
      cy.wait('@shortLinks')

      cy.contains('+ Link nou').click()
      cy.get('[data-testid="short-link-label-input"]').type('Implicit')
      cy.get('[data-testid="short-link-create-btn"]').click()
      cy.wait('@create').its('request.body').should('deep.include', { previewMode: 'content' })
    })

    it('switches the preview mode through PATCH', () => {
      interceptPreview()
      cy.intercept('PATCH', '/api/admin/content/*/short-links/sl-1', {
        statusCode: 200,
        body: { ...mockShortLink1, previewMode: 'destination' },
      }).as('patch')
      openWithLinks()
      cy.get('[data-testid="short-link-row-sl-1"]').should('not.contain', '· destinație')

      cy.intercept('GET', '/api/admin/content/*/short-links', {
        shortLinks: [{ ...mockShortLink1, previewMode: 'destination' }],
      }).as('shortLinksRefetch')
      interceptPreview({ ...mockPreview, mode: 'destination', willPreview: false, reason: 'mode-destination' })

      cy.get('[data-testid="short-link-preview-toggle-sl-1"]').click()
      cy.get('[data-testid="short-link-preview-sl-1"]').within(() => {
        cy.get('input[type="radio"][value="destination"]').check()
      })
      cy.wait('@patch').its('request.body').should('deep.equal', { previewMode: 'destination' })
      cy.contains('Previzualizare actualizată').should('be.visible')
      cy.get('[data-testid="short-link-row-sl-1"]').should('contain', '· destinație')
      cy.get('[data-testid="short-link-preview-sl-1"]')
        .should('contain', 'Se va folosi previzualizarea paginii destinație')
        .and('contain', 'linkul este setat pe «Pagina destinație»')
    })

    it('shows the fallback notice and no image when the item cannot be previewed', () => {
      interceptPreview({ ...mockPreview, willPreview: false, reason: 'no-title-no-image' })
      openWithLinks()
      cy.get('[data-testid="short-link-preview-toggle-sl-1"]').click()
      cy.wait('@preview')
      cy.get('[data-testid="short-link-preview-sl-1"]').within(() => {
        cy.contains('Se va folosi previzualizarea paginii destinație').should('be.visible')
        cy.contains('conținutul nu are titlu și nici imagine').should('be.visible')
        cy.get('img').should('not.exist')
      })
    })

    it('links to the preview page and to the Meta Sharing Debugger', () => {
      interceptPreview()
      openWithLinks()
      cy.get('[data-testid="short-link-preview-toggle-sl-1"]').click()
      cy.get('[data-testid="short-link-preview-sl-1"]').within(() => {
        cy.contains('a', 'Deschide pagina de previzualizare')
          .should('have.attr', 'href', '/s/abc123?preview=1')
          .and('have.attr', 'target', '_blank')
        cy.contains('a', 'Verifică în Meta Sharing Debugger')
          .should('have.attr', 'href')
          .and('contain', 'developers.facebook.com/tools/debug/')
          .and('contain', encodeURIComponent('https://info.bisericabetel.com/s/abc123'))
      })
    })
  })

  describe('with Romanian and English enabled', () => {
    beforeEach(() => setup([langRo, langEn]))

    it('re-requests the preview in the chosen language', () => {
      interceptPreview()
      openWithLinks()
      cy.get('[data-testid="short-link-preview-toggle-sl-1"]').click()
      cy.wait('@preview')
      cy.get('[data-testid="short-link-preview-locale"]').should('be.visible').and('have.value', 'ro')

      cy.intercept('GET', '/api/admin/content/*/short-links/sl-1/preview?locale=en', {
        ...mockPreview, locale: 'en', title: 'Sunday programme',
        url: 'https://info.bisericabetel.com/s/abc123?lang=en',
      }).as('previewEn')
      cy.get('[data-testid="short-link-preview-locale"]').select('en')
      cy.wait('@previewEn').its('request.url').should('include', 'locale=en')
      cy.get('[data-testid="short-link-preview-sl-1"]').should('contain', 'Sunday programme')
    })

    it('copies a language variant of the short link', () => {
      openWithLinks()
      cy.window().then(win => {
        cy.stub(win.navigator.clipboard, 'writeText').as('writeText').resolves()
      })
      cy.get('[data-testid="short-link-row-sl-1"]').within(() => {
        cy.get('button[aria-label="Copiază link (EN)"]').click()
      })
      cy.get('@writeText').should('have.been.calledOnceWith', 'https://info.bisericabetel.com/s/abc123?lang=en')
      cy.contains('Link copiat').should('be.visible')
    })
  })
})
