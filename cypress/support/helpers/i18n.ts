/**
 * Shared i18n intercept stubs for Cypress tests.
 * Stubs /api/languages and /api/translations* with minimal fixture data.
 */
export function stubI18nRoutes() {
  cy.intercept('GET', '/api/languages', {
    languages: [
      { code: 'ro', name: 'Română', isDefault: true, enabled: true },
      { code: 'en', name: 'English', isDefault: false, enabled: true },
    ],
  }).as('languages')
  cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} }).as('translations')
}
