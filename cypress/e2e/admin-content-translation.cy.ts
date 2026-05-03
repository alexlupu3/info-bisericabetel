/**
 * i18n — Admin content form translation mode
 */
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const mockLanguages = {
  languages: [
    { code: 'ro', name: 'Română', isDefault: true, enabled: true },
    { code: 'en', name: 'English', isDefault: false, enabled: true },
  ],
}

const mockItem = {
  id: 'item-1', type: 'card', state: 'draft',
  sites: [], orderPosition: 0, groupId: null,
  expiresAt: null,
  data: { title: 'Titlu original', description: 'Descriere originală', cta: 'Înregistrează-te' },
  createdAt: '2024-01-01', updatedAt: '2024-01-01',
}

function loginAndVisit() {
  cy.intercept('GET', '/api/auth/me', mockUser).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [mockItem] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.intercept('GET', '/api/admin/languages', mockLanguages).as('languages')
  cy.intercept('GET', `/api/admin/content/${mockItem.id}/translations`, { translations: [] }).as('itemTranslations')
  cy.visit('/admin/', {
    onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) },
  })
  cy.wait('@me')
}

describe('Admin — Content form translation mode', () => {
  beforeEach(() => {
    loginAndVisit()
  })

  it('does not show language selector in create mode', () => {
    cy.get('[data-testid="create-content-btn"]').click()
    cy.get('[data-testid="create-form"]').should('be.visible')
    cy.get('[data-testid="translation-locale-select"]').should('not.exist')
  })

  it('shows language selector in edit mode', () => {
    // Click the edit button for the item
    cy.get('[data-testid="content-row-item-1"]').should('exist')
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.get('[data-testid="edit-form"]').should('be.visible')
    cy.get('[data-testid="translation-locale-select"]').should('be.visible')
  })

  it('switches to translation mode and shows only text fields', () => {
    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.get('[data-testid="edit-form"]').should('be.visible')

    // Select English
    cy.get('[data-testid="translation-locale-select"]').select('en')

    // Translation fields should be visible
    cy.get('[data-testid="trans-title-input"]').should('be.visible')
    cy.get('[data-testid="trans-description-input"]').should('be.visible')
    cy.get('[data-testid="trans-cta-input"]').should('be.visible')

    // Original form fields should NOT be visible
    cy.get('[data-testid="create-title-input"]').should('not.exist')
    cy.get('[data-testid="create-description-input"]').should('not.exist')
  })

  it('saves a translation', () => {
    cy.intercept('PUT', `/api/admin/content/${mockItem.id}/translations/en`, {
      id: 'trans-1', contentItemId: mockItem.id, locale: 'en',
      data: { title: 'Original Title' },
      createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }).as('saveTranslation')

    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.get('[data-testid="translation-locale-select"]').select('en')

    cy.get('[data-testid="trans-title-input"]').type('Original Title')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@saveTranslation')
  })

  it('shows translation badges when translations exist', () => {
    cy.intercept('GET', `/api/admin/content/${mockItem.id}/translations`, {
      translations: [
        { id: 't1', contentItemId: mockItem.id, locale: 'en', data: { title: 'English Title' }, createdAt: '', updatedAt: '' },
      ],
    }).as('itemTranslationsExist')

    cy.get('[data-testid="item-menu-trigger-item-1"]').click()
    cy.get('[data-testid="item-menu-edit-item-1"]').click()
    cy.wait('@itemTranslationsExist')

    // Should show the EN badge
    cy.contains('EN').should('be.visible')
  })
})

export {}
