/**
 * i18n — Public site language switching
 */
const SITES_FIXTURE = {
  sites: [
    { slug: 'manastur', name: 'Mănăștur', accent: '#17d3c3' },
    { slug: 'centru', name: 'Centru', accent: '#ff6200' },
  ],
}

const LANGUAGES_FIXTURE = {
  languages: [
    { code: 'ro', name: 'Română', isDefault: true, enabled: true },
    { code: 'en', name: 'English', isDefault: false, enabled: true },
  ],
}

const EN_TRANSLATIONS = {
  locale: 'en',
  translations: {
    'hero.subtitle': 'Stay up to date with the schedule and activities of Betel Church',
    'content.error': 'Could not load content. Please try again.',
    'content.empty.noSite': 'No information available at this time.',
    'content.empty.hint': 'Come back later or select another location.',
    'footer.copyright': 'Betel Baptist Church · Cluj-Napoca',
    'sites.all': 'All locations',
  },
}

const EMPTY_CONTENT = { site: null, items: [] }

describe('i18n — Public language switching', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/sites', SITES_FIXTURE).as('sites')
    cy.intercept('GET', '/api/content*', EMPTY_CONTENT).as('content')
    cy.intercept('GET', '/api/languages', LANGUAGES_FIXTURE).as('languages')
    cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} }).as('translations')
    // Clear localStorage to start with default (Romanian)
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.removeItem('betel-lang')
      }
    })
  })

  it('defaults to Romanian', () => {
    cy.get('[data-testid="hero-subtitle"]')
      .should('contain', 'Rămâi la curent cu programul și activitățile bisericii Betel')
  })

  it('shows language switcher in footer', () => {
    cy.get('[data-testid="language-switcher"]').should('be.visible')
  })

  it('switches to English and updates UI strings', () => {
    cy.intercept('GET', '/api/translations?locale=en', EN_TRANSLATIONS).as('enTranslations')

    cy.get('[data-testid="language-switcher"]').click()
    cy.wait('@enTranslations')

    cy.get('[data-testid="hero-subtitle"]')
      .should('contain', 'Stay up to date with the schedule and activities of Betel Church')
  })

  it('persists language preference across page reload', () => {
    cy.intercept('GET', '/api/translations?locale=en', EN_TRANSLATIONS).as('enTranslations')

    // Switch to English
    cy.get('[data-testid="language-switcher"]').click()
    cy.wait('@enTranslations')

    // Reload and verify English is still active
    cy.intercept('GET', '/api/translations?locale=en', EN_TRANSLATIONS).as('enTranslations2')
    cy.reload()
    cy.wait('@enTranslations2')

    cy.get('[data-testid="hero-subtitle"]')
      .should('contain', 'Stay up to date')
  })

  it('falls back to Romanian when translation is missing for a key', () => {
    // Only provide a partial set of translations
    const partialTranslations = {
      locale: 'en',
      translations: {
        'hero.subtitle': 'Stay up to date with Betel Church',
        // Missing other keys — should fall back to Romanian
      },
    }
    cy.intercept('GET', '/api/translations?locale=en', partialTranslations).as('enPartial')

    cy.get('[data-testid="language-switcher"]').click()
    cy.wait('@enPartial')

    // Hero subtitle should be English
    cy.get('[data-testid="hero-subtitle"]').should('contain', 'Stay up to date with Betel Church')

    // Empty state hint should still be in Romanian (not translated)
    cy.get('[data-testid="content-empty"]').should('exist')
      .and('contain', 'Revino mai târziu sau selectează o altă locație.')
  })

  it('re-fetches content with locale param when language changes', () => {
    cy.intercept('GET', '/api/translations?locale=en', EN_TRANSLATIONS).as('enTranslations')
    cy.intercept('GET', '/api/content?locale=en', {
      site: null,
      items: [{
        id: 'test-en', type: 'richtext', state: 'published',
        sites: [], orderPosition: 0, groupId: null, groupTitle: null,
        expiresAt: null, data: { body: 'English content body' }, createdAt: '', updatedAt: '',
      }],
    }).as('enContent')

    cy.get('[data-testid="language-switcher"]').click()
    cy.wait('@enTranslations')
    cy.wait('@enContent')

    cy.contains('English content body').should('be.visible')
  })
})

export {}
