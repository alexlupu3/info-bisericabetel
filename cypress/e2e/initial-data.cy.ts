/**
 * Spec 03 FR-070 — server-rendered pages inline `#betel-initial-data`; the SPA seeds its
 * cache from it and does not refetch. Without the script (Vite dev, service-worker
 * shell) the app fetches as before. The script is injected into the HTML document
 * response here, as the API does in production.
 */
import { LANGUAGES_FIXTURE, SITES_FIXTURE, baseItem, stubPublicBasics } from '../support/helpers/public'

const content = {
  site: null,
  items: [{ ...baseItem, id: 'inline-1', type: 'richtext', data: { body: 'Conținut din HTML-ul serverului.' } }],
}

function injectInitialData(path: string, data: object) {
  cy.intercept({ method: 'GET', url: path, headers: { accept: /text\/html/ } }, req => {
    req.continue(res => {
      const json = JSON.stringify(data).replace(/</g, '\\u003c')
      res.body = String(res.body).replace(
        '<div id="root"></div>',
        `<div id="root"></div><script id="betel-initial-data" type="application/json">${json}</script>`,
      )
    })
  })
}

describe('Inline initial data', () => {
  beforeEach(() => {
    stubPublicBasics()
  })

  it('renders the feed from the inline data without calling /api/content', () => {
    cy.intercept('GET', '/api/content*', cy.spy().as('contentRequest'))
    injectInitialData('/', {
      path: '/', locale: 'ro', sites: SITES_FIXTURE.sites, languages: LANGUAGES_FIXTURE.languages,
      content, item: null,
      seo: { siteName: 'Betel Info', orgName: 'Biserica Baptistă Betel', baseUrl: 'https://hub.example' },
    })
    cy.visit('/')
    cy.contains('Conținut din HTML-ul serverului.').should('be.visible')
    cy.get('link[rel="canonical"]').should('have.attr', 'href', 'https://hub.example/')
    cy.get('@contentRequest').should('not.have.been.called')
  })

  it('fetches content when the page has no inline data (service-worker / offline shell)', () => {
    cy.intercept('GET', '/api/content*', content).as('content')
    cy.visit('/')
    cy.wait('@content')
    cy.contains('Conținut din HTML-ul serverului.').should('be.visible')
  })
})
