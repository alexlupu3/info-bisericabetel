/**
 * Admin media library — upload, list, and attach to content
 */
const ADMIN_URL = '/admin/'
const mockToken = 'mock-jwt-token'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }

const mockMediaItem = {
  id: 'm1',
  url: '/uploads/abc.webp',
  filename: 'abc.webp',
  originalName: 'test-photo.jpg',
  size: 120000,
  mimeType: 'image/webp',
  createdAt: '2026-01-01T00:00:00Z',
  usedBy: [],
}

const mockMediaInUse = {
  ...mockMediaItem,
  id: 'm2',
  url: '/uploads/def.webp',
  filename: 'def.webp',
  originalName: 'banner.jpg',
  usedBy: [{ id: 'c1', type: 'card', name: 'Easter Service' }],
}

function setupAdmin() {
  cy.intercept('POST', '/api/auth/login', { token: mockToken, user: mockUser })
  cy.intercept('GET',  '/api/auth/me', mockUser)
  cy.intercept('GET',  '/api/sites', { sites: [] })
  cy.intercept('GET',  '/api/admin/content', { items: [] })
  cy.intercept('GET',  '/api/admin/groups', { groups: [] })
  localStorage.setItem('betel-admin-token', mockToken)
}

describe('Admin — media library', () => {
  beforeEach(() => {
    setupAdmin()
  })

  it('displays uploaded images in the media library', () => {
    cy.intercept('GET', '/api/admin/media', { media: [mockMediaItem, mockMediaInUse] })
    cy.visit('/admin/media')
    cy.get('[data-testid="media-card"]').should('have.length', 2)
    cy.contains('test-photo.jpg')
    cy.contains('banner.jpg')
  })

  it('shows "Utilizat" badge and content name for in-use images', () => {
    cy.intercept('GET', '/api/admin/media', { media: [mockMediaInUse] })
    cy.visit('/admin/media')
    cy.contains('Utilizat').should('be.visible')
    cy.contains('Easter Service').should('be.visible')
    cy.get('[data-testid="delete-media-btn"]').should('not.exist')
  })

  it('shows delete button for unused images', () => {
    cy.intercept('GET', '/api/admin/media', { media: [mockMediaItem] })
    cy.visit('/admin/media')
    cy.get('[data-testid="delete-media-btn"]').should('be.visible')
  })

  it('deletes an unused image and refreshes the list', () => {
    cy.intercept('GET',    '/api/admin/media', { media: [mockMediaItem] })
    cy.intercept('DELETE', `/api/admin/media/${mockMediaItem.id}`, { statusCode: 204 }).as('delete')
    cy.intercept('GET',    '/api/admin/media', { media: [] }).as('refreshed')

    cy.visit('/admin/media')
    cy.get('[data-testid="delete-media-btn"]').click()
    cy.wait('@delete')
    cy.get('[data-testid="media-card"]').should('not.exist')
  })
})

describe('Admin — upload image when creating a card', () => {
  beforeEach(() => {
    setupAdmin()
    cy.intercept('GET', '/api/admin/content', { items: [] })
    cy.intercept('GET', '/api/admin/groups', { groups: [] })
    cy.intercept('GET', '/api/sites', { sites: [] })
  })

  it('uploads an image and attaches it as a card thumbnail', () => {
    cy.intercept('POST', '/api/admin/media', {
      statusCode: 200,
      body: { url: '/uploads/abc.webp', id: 'm1' },
    }).as('uploadMedia')

    cy.intercept('POST', '/api/admin/content', (req) => {
      expect(req.body.data.thumbnail).to.equal('/uploads/abc.webp')
      req.reply({ statusCode: 201, body: { id: 'c1', ...req.body, state: 'draft' } })
    }).as('createCard')

    cy.visit(ADMIN_URL)

    cy.get('[data-testid="create-content-btn"]').click()

    cy.get('[data-testid="create-type-select"]').select('card')
    cy.get('[data-testid="create-title-input"]').type('Easter Service')

    cy.get('[data-testid="upload-btn"]').first().within(() => {
      cy.get('input[type="file"]').selectFile(
        { contents: Cypress.Buffer.from('fakeimagebytes'), fileName: 'photo.jpg', mimeType: 'image/jpeg' },
        { force: true },
      )
    })

    cy.wait('@uploadMedia')
    cy.get('img[data-testid="create-thumbnail-input"]').should('have.attr', 'src', '/uploads/abc.webp')

    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@createCard')
  })
})

export {}
