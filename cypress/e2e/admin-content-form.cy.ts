/**
 * Increment 5 — Complete content form: type-specific fields, sites, expiry, edit
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'
const mockSites = [
  { slug: 'centru', name: 'Centru', accent: '#3b82f6' },
  { slug: 'vest', name: 'Vest', accent: '#22c55e' },
]

function setup() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: mockSites }).as('sites')
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@me')
}

describe('Content form — type-specific fields', () => {
  beforeEach(setup)

  it('creates a card item with description, date and link', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'c1', type: 'card', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: { title: 'Eveniment', description: 'Detalii', startDate: '2026-04-01', link: 'https://betel.ro' },
      createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-title-input"]').type('Eveniment')
    cy.get('[data-testid="create-description-input"]').type('Detalii')
    cy.get('[data-testid="create-date-input"]').type('2026-04-01')
    cy.get('[data-testid="create-link-input"]').type('https://betel.ro')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { type: 'card' })
  })

  it('creates a video item with YouTube URL', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'v1', type: 'video', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: { url: 'https://youtu.be/abc123' },
      createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('video')
    cy.get('[data-testid="create-url-input"]').type('https://youtu.be/abc123')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body').should('deep.include', { type: 'video' })
  })

  it('creates a poster item with uploaded image', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'p1', type: 'poster', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: { imageUrl: '/uploads/test.jpg', name: 'Poster tineret' },
      createdAt: '', updatedAt: '',
    }}).as('create')
    cy.intercept('POST', '/api/admin/media', { statusCode: 201, body: {
      id: 'm1',
      url: '/uploads/test.jpg',
    }}).as('upload')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('poster')
    cy.get('[data-testid="create-poster-name-input"]').type('Poster tineret')
    cy.get('[data-testid="upload-btn"] input[type="file"]').selectFile({
      contents: Cypress.Buffer.from('fake-image'),
      fileName: 'poster.jpg',
      mimeType: 'image/jpeg',
      lastModified: Date.now(),
    }, { force: true })
    cy.wait('@upload')
    cy.get('[data-testid="create-image-url-input"]').should('have.attr', 'src', '/uploads/test.jpg')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body').should(body => {
      expect(body).to.deep.include({ type: 'poster' })
      expect(body.data).to.deep.include({ imageUrl: '/uploads/test.jpg', name: 'Poster tineret' })
    })
  })

  it('date fields are present and shared for all content types', () => {
    cy.get('[data-testid="create-content-btn"]').click()

    // Card
    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-date-input"]').should('exist')
    cy.get('[data-testid="create-end-date-input"]').should('not.exist')
    cy.get('[data-testid="create-date-input"]').type('2026-05-01')
    cy.get('[data-testid="create-end-date-input"]').should('exist')

    // Richtext
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-date-input"]').should('exist')

    // Poster
    cy.get('[data-testid="create-type-select"]').select('poster')
    cy.get('[data-testid="create-date-input"]').should('exist')

    // Video
    cy.get('[data-testid="create-type-select"]').select('video')
    cy.get('[data-testid="create-date-input"]').should('exist')
  })

  it('sends startDate and endDate for a richtext item with dates', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'rt1', type: 'richtext', state: 'draft', sites: [], orderPosition: 0,
      groupId: null, expiresAt: null, data: { body: 'Anunț cu dată', startDate: '2026-05-10', endDate: '2026-05-15' },
      createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Anunț cu dată')
    cy.get('[data-testid="create-date-input"]').type('2026-05-10')
    cy.get('[data-testid="create-end-date-input"]').type('2026-05-15')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body').should(body => {
      expect(body.type).to.eq('richtext')
      expect(body.data.startDate).to.eq('2026-05-10')
      expect(body.data.endDate).to.eq('2026-05-15')
    })
  })

  it('default type is card when opening the create form', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').should('have.value', 'card')
  })

  it('assigns content to specific sites', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'r1', type: 'richtext', state: 'draft', sites: ['centru', 'vest'], orderPosition: 0,
      groupId: null, expiresAt: null, data: { body: 'Anunț' }, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Anunț')
    cy.get('[data-testid="site-check-centru"]').check()
    cy.get('[data-testid="site-check-vest"]').check()
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.sites').should('include.members', ['centru', 'vest'])
  })
})

describe('Content form — edit mode', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/auth/me', mockUser).as('me')
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: mockSites })
    cy.intercept('GET', '/api/admin/content', {
      items: [{
        id: 'item-1', type: 'richtext', state: 'draft', sites: ['centru'],
        orderPosition: 0, groupId: null, expiresAt: null,
        data: { title: 'Titlu vechi', body: 'Corp vechi' }, createdAt: '', updatedAt: '',
      }],
    })
    cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
    cy.wait('@me')
  })

  it('opens edit form pre-filled with item data', () => {
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.get('[data-testid="edit-form"]').should('be.visible')
    cy.get('[data-testid="create-title-input"]').should('have.value', 'Titlu vechi')
    cy.get('[data-testid="create-body-input"]').should('have.value', 'Corp vechi')
    cy.get('[data-testid="site-check-centru"]').should('be.checked')
  })

  it('saves edited item via PATCH', () => {
    cy.intercept('PATCH', '/api/admin/content/item-1', {
      id: 'item-1', type: 'richtext', state: 'draft', sites: ['centru'],
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { title: 'Titlu nou', body: 'Corp nou' }, createdAt: '', updatedAt: '',
    }).as('patch')

    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.get('[data-testid="create-title-input"]').clear().type('Titlu nou')
    cy.get('[data-testid="create-body-input"]').clear().type('Corp nou')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@patch')
  })

  it('clicking the content item name opens the edit form inline', () => {
    cy.get('[data-testid="content-name-item-1"]').click()
    cy.get('[data-testid="edit-form"]').should('be.visible')
    cy.get('[data-testid="create-title-input"]').should('have.value', 'Titlu vechi')
  })
})

describe('Content admin — past badge for all content types', () => {
  const ADMIN_URL = '/admin/'
  const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
  const mockToken = 'mock-jwt-token'

  function setupWithItems(items: object[]) {
    cy.intercept('GET', '/api/auth/me', mockUser).as('me')
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: [] })
    cy.intercept('GET', '/api/admin/content', { items }).as('content')
    cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
    cy.wait('@me')
  }

  const base = {
    state: 'published', sites: [], orderPosition: 0, groupId: null,
    expiresAt: null, createdAt: '', updatedAt: '',
  }

  it('shows past badge for a card with past endDate', () => {
    setupWithItems([{
      ...base, id: 'c1', type: 'card',
      data: { title: 'Card trecut', startDate: '2025-01-01', endDate: '2025-01-05' },
    }])
    cy.get('[data-testid="past-badge-c1"]').should('be.visible')
  })

  it('shows past badge for a richtext with past startDate', () => {
    setupWithItems([{
      ...base, id: 'r1', type: 'richtext',
      data: { body: 'Anunț vechi', startDate: '2025-03-01' },
    }])
    cy.get('[data-testid="past-badge-r1"]').should('be.visible')
  })

  it('shows past badge for a poster with past endDate', () => {
    setupWithItems([{
      ...base, id: 'p1', type: 'poster',
      data: { imageUrl: '/img.jpg', startDate: '2025-06-01', endDate: '2025-06-10' },
    }])
    cy.get('[data-testid="past-badge-p1"]').should('be.visible')
  })

  it('shows past badge for a video with past startDate', () => {
    setupWithItems([{
      ...base, id: 'v1', type: 'video',
      data: { url: 'https://youtu.be/abc', startDate: '2025-09-01' },
    }])
    cy.get('[data-testid="past-badge-v1"]').should('be.visible')
  })

  it('does not show past badge for a future item', () => {
    setupWithItems([{
      ...base, id: 'f1', type: 'richtext',
      data: { body: 'Anunț viitor', startDate: '2099-01-01' },
    }])
    cy.get('[data-testid="past-badge-f1"]').should('not.exist')
  })

  it('does not show past badge for an item with no dates', () => {
    setupWithItems([{
      ...base, id: 'n1', type: 'richtext',
      data: { body: 'Anunț permanent' },
    }])
    cy.get('[data-testid="past-badge-n1"]').should('not.exist')
  })
})

describe('Content form — site-exclusive', () => {
  beforeEach(setup)

  it('toggling exclusive hides multi-site checkboxes and shows the radio group', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Anunț exclusiv')

    // Sanity: multi-checkbox exists before toggling
    cy.get('[data-testid="site-check-centru"]').should('exist')

    cy.get('[data-testid="exclusive-toggle"]').check()

    cy.get('[data-testid="site-check-centru"]').should('not.exist')
    cy.get('[data-testid="site-check-vest"]').should('not.exist')
    cy.get('[data-testid="exclusive-site-radio-centru"]').should('exist').and('be.checked')
    cy.get('[data-testid="exclusive-site-radio-vest"]').should('exist').and('not.be.checked')
  })

  it('submits exclusiveSite and forces sites to []', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'rt-ex', type: 'richtext', state: 'draft', sites: [], exclusiveSite: 'vest',
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { body: 'Anunț exclusiv' }, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Anunț exclusiv')
    cy.get('[data-testid="exclusive-toggle"]').check()
    cy.get('[data-testid="exclusive-site-radio-vest"]').check()
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@create').its('request.body').should(body => {
      expect(body).to.deep.include({ exclusiveSite: 'vest' })
      expect(body.sites).to.deep.equal([])
    })
  })

  it('untoggling exclusive restores multi-checkboxes and clears exclusiveSite on submit', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: {
      id: 'rt-multi', type: 'richtext', state: 'draft', sites: ['centru', 'vest'], exclusiveSite: null,
      orderPosition: 0, groupId: null, expiresAt: null,
      data: { body: 'Anunț multi' }, createdAt: '', updatedAt: '',
    }}).as('create')

    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-type-select"]').select('richtext')
    cy.get('[data-testid="create-body-input"]').type('Anunț multi')

    // Toggle on then off
    cy.get('[data-testid="exclusive-toggle"]').check()
    cy.get('[data-testid="site-check-centru"]').should('not.exist')
    cy.get('[data-testid="exclusive-toggle"]').uncheck()

    // Multi-checkboxes are back
    cy.get('[data-testid="site-check-centru"]').should('exist')
    cy.get('[data-testid="site-check-vest"]').should('exist')
    cy.get('[data-testid="exclusive-site-radio-centru"]').should('not.exist')

    cy.get('[data-testid="site-check-centru"]').check()
    cy.get('[data-testid="site-check-vest"]').check()
    cy.get('[data-testid="create-submit-btn"]').click()

    cy.wait('@create').its('request.body').should(body => {
      expect(body.exclusiveSite).to.eq(null)
      expect(body.sites).to.include.members(['centru', 'vest'])
    })
  })
})

describe('Content form — site-exclusive edit mode', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/auth/me', mockUser).as('me')
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: mockSites })
    cy.intercept('GET', '/api/admin/content', {
      items: [{
        id: 'item-ex', type: 'richtext', state: 'draft',
        sites: [], exclusiveSite: 'vest',
        orderPosition: 0, groupId: null, expiresAt: null,
        data: { body: 'Anunț doar vest' }, createdAt: '', updatedAt: '',
      }],
    })
    cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
    cy.wait('@me')
  })

  it('pre-fills the exclusive radio when editing an exclusive item', () => {
    cy.get('[data-testid="item-menu-trigger-item-ex"]').click()
    cy.get('[data-testid="item-menu-edit-item-ex"]').click()
    cy.get('[data-testid="edit-form"]').should('be.visible')
    cy.get('[data-testid="exclusive-toggle"]').should('be.checked')
    cy.get('[data-testid="exclusive-site-radio-vest"]').should('be.checked')
    cy.get('[data-testid="exclusive-site-radio-centru"]').should('exist').and('not.be.checked')
    cy.get('[data-testid="site-check-centru"]').should('not.exist')
  })

  it('shows the exclusive badge in the list for an exclusive item', () => {
    cy.get('[data-testid="exclusive-badge-vest"]').should('exist')
  })
})
