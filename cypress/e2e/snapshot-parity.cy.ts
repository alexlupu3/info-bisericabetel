/**
 * Spec 03 §9.2 — the server-rendered HTML snapshot (packages/api/src/services/seo/
 * render-snapshot.ts) and the SPA must show the same items: same (title, date, link)
 * per item, in the same order, for the same data. Guards the two renderers from drifting.
 */
import { SITES_FIXTURE, LANGUAGES_FIXTURE, baseItem, stubPublicBasics } from '../support/helpers/public'

const items = [
  { ...baseItem, id: 'p-card', type: 'card', data: { title: 'Seară de rugăciune', startDate: '2099-03-01', startTime: '19:30', link: 'https://example.com/rugaciune', cta: 'Detalii' } },
  { ...baseItem, id: 'p-range', type: 'card', data: { title: 'Conferință', startDate: '2099-04-10', endDate: '2099-04-12' } },
  { ...baseItem, id: 'p-group-1', type: 'card', groupId: 'g', groupTitle: 'Grupuri', sites: ['centru'], data: { title: 'Grup de tineri', link: 'https://example.com/tineri', siteLinks: { centru: 'https://example.com/tineri-centru' } } },
  { ...baseItem, id: 'p-group-2', type: 'richtext', groupId: 'g', groupTitle: 'Grupuri', data: { title: 'Program', body: 'Duminică **10:00**' } },
  { ...baseItem, id: 'p-poster', type: 'poster', data: { imageUrl: '/icons/icon-512.png', alt: 'Afiș concert', link: 'https://example.com/afis' } },
  { ...baseItem, id: 'p-video', type: 'video', data: { title: 'Predica', url: 'https://youtu.be/dQw4w9WgXcQ' } },
]

type Tuple = { id: string; title: string; date: string; link: string }

function tuples(root: ParentNode): Tuple[] {
  return Array.from(root.querySelectorAll('article[data-item-id]')).map(article => {
    const heading = article.querySelector('h2, h3')
    const img = article.querySelector('img')
    const time = article.querySelector('time')
    const dateLine = article.querySelector('p.text-\\[10px\\]')
    return {
      id: article.getAttribute('data-item-id') ?? '',
      title: (heading?.textContent ?? img?.getAttribute('alt') ?? '').trim(),
      date: time ? `${time.getAttribute('datetime')}|${time.textContent}` : (dateLine?.textContent ?? '').trim(),
      link: article.closest('a')?.getAttribute('href') ?? '',
    }
  })
}

function compare(path: string, siteSlug: string | null) {
  const kind = siteSlug ? 'site' : 'hub'
  cy.task<string>('renderSnapshot', {
    kind, path, siteSlug, sites: SITES_FIXTURE.sites, languages: LANGUAGES_FIXTURE.languages, items,
  }).then(html => {
    const snapshot = tuples(new DOMParser().parseFromString(html, 'text/html'))
    expect(snapshot.map(t => t.id)).to.deep.equal(items.map(i => i.id))

    cy.visit(path)
    cy.get('[data-testid="content-list"]').should('exist')
    cy.document().then(doc => {
      expect(tuples(doc)).to.deep.equal(snapshot)
    })
  })
}

describe('Snapshot parity — server snapshot vs SPA', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  })

  it('renders the same items on the hub', () => compare('/', null))

  it('renders the same items on a site page (per-site link overrides)', () => compare('/centru', 'centru'))
})
