/**
 * i18n — Admin TranslationsPage
 */
const mockSuperAdmin = { id: 'u1', email: 'admin@betel.ro', role: 'super-admin', mustChangePassword: false }
const mockAdmin = { id: 'u2', email: 'editor@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const mockLanguages = {
  languages: [
    { code: 'ro', name: 'Română', isDefault: true, enabled: true },
    { code: 'en', name: 'English', isDefault: false, enabled: true },
  ],
}

const mockTranslationKeys = {
  keys: [
    { key: 'hero.subtitle', values: { en: 'Stay up to date with Betel Church' } },
  ],
}

function loginAsSuperAdmin() {
  cy.intercept('GET', '/api/auth/me', mockSuperAdmin).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.intercept('GET', '/api/admin/languages', mockLanguages).as('languages')
  cy.intercept('GET', '/api/admin/translations', mockTranslationKeys).as('translations')
}

function loginAsAdmin() {
  cy.intercept('GET', '/api/auth/me', mockAdmin).as('me')
  cy.intercept('GET', '/api/admin/content', { items: [] }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups: [] }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] }).as('sites')
  cy.intercept('GET', '/api/admin/languages', mockLanguages).as('languages')
}

describe('Admin — Translations page', () => {
  it('shows Traduceri nav link for super-admin', () => {
    loginAsSuperAdmin()
    cy.visit('/admin/', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Traduceri').should('be.visible')
  })

  it('hides Traduceri nav link for regular admin', () => {
    loginAsAdmin()
    cy.visit('/admin/', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Traduceri').should('not.exist')
  })

  it('displays language list on translations page', () => {
    loginAsSuperAdmin()
    cy.visit('/admin/translations', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Limbi').should('be.visible')
    cy.contains('Română').should('be.visible')
    cy.contains('(implicit)').should('be.visible')
    cy.contains('English').should('be.visible')
  })

  it('displays UI translation keys with values', () => {
    loginAsSuperAdmin()
    cy.visit('/admin/translations', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Traduceri interfață').should('be.visible')
    cy.contains('hero.subtitle').should('be.visible')
  })

  it('generates missing UI translations via AI button', () => {
    loginAsSuperAdmin()
    cy.intercept('POST', '/api/admin/translations/generate', { generated: 3 }).as('generate')
    cy.visit('/admin/translations', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Generează lipsă').click()
    cy.wait('@generate')
    cy.contains('3 traduceri generate').should('be.visible')
  })

  it('shows no-missing toast when AI generation finds nothing to generate', () => {
    loginAsSuperAdmin()
    cy.intercept('POST', '/api/admin/translations/generate', { generated: 0 }).as('generate')
    cy.visit('/admin/translations', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')
    cy.contains('Generează lipsă').click()
    cy.wait('@generate')
    cy.contains('Nu lipsesc traduceri').should('be.visible')
  })

  it('saves edited translations', () => {
    loginAsSuperAdmin()
    cy.intercept('PUT', '/api/admin/translations', { ok: true }).as('saveTranslations')
    cy.visit('/admin/translations', {
      onBeforeLoad(win) { win.sessionStorage.setItem('betel-admin-token', mockToken) },
    })
    cy.wait('@me')

    // Find the content.error key row and type a translation
    cy.contains('content.error')
      .closest('div.border')
      .find('input')
      .first()
      .clear()
      .type('Could not load content.')

    // Click save
    cy.contains('Salvează').click()
    cy.wait('@saveTranslations')
  })
})

export {}
