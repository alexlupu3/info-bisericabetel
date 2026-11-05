/**
 * Spec 03 §9.2 — the server-rendered HTML snapshot (packages/api/src/services/seo/
 * render-snapshot.ts) and the SPA must show the same items: same (title, date, link)
 * (+ location row, spec 07) per item, in the same order, for the same data. Guards the two renderers from drifting.
 * Spec 08: both also print the same group heading counts and deck slots (data-slot).
 */
import { SITES_FIXTURE, LANGUAGES_FIXTURE, baseItem, stubPublicBasics } from '../support/helpers/public'

const items = [
  { ...baseItem, id: 'p-card', type: 'card', data: { title: 'Seară de rugăciune', startDate: '2099-03-01', startTime: '19:30', link: 'https://example.com/rugaciune', cta: 'Detalii' } },
  { ...baseItem, id: 'p-range', type: 'card', data: { title: 'Conferință', startDate: '2099-04-10', endDate: '2099-04-12', location: 'Sala mare, etaj 1' } },
  { ...baseItem, id: 'p-group-1', type: 'card', groupId: 'g', groupTitle: 'Grupuri', sites: ['centru'], data: { title: 'Grup de tineri', link: 'https://example.com/tineri', siteLinks: { centru: 'https://example.com/tineri-centru' } } },
  { ...baseItem, id: 'p-group-2', type: 'richtext', groupId: 'g', groupTitle: 'Grupuri', data: { title: 'Program', body: 'Duminică **10:00**' } },
  // A group of 4 (spec 08): collapses on phones; the pinned item tops the deck.
  ...['1', '2', '3', '4'].map(n => ({
    ...baseItem, id: `p-ev-${n}`, type: 'card', groupId: 'ev', groupTitle: 'Evenimente', pinnedInGroup: n === '3',
    data: { title: `Eveniment ${n}`, startDate: `2099-05-0${n}`, link: `https://example.com/ev-${n}` },
  })),
  { ...baseItem, id: 'p-poster', type: 'poster', data: { imageUrl: '/icons/icon-512.png', alt: 'Afiș concert', link: 'https://example.com/afis' } },
  { ...baseItem, id: 'p-video', type: 'video', data: { title: 'Predica', url: 'https://youtu.be/dQw4w9WgXcQ' } },
]

type Tuple = { id: string; title: string; date: string; location: string; link: string }

function tuples(root: ParentNode): Tuple[] {
  return Array.from(root.querySelectorAll('article[data-item-id]')).map(article => {
    const heading = article.querySelector('h2, h3')
    const img = article.querySelector('img')
    const time = article.querySelector('time')
    const dateLine = article.querySelector('p.text-\\[10px\\]:not([data-testid="event-location"])')
    const location = article.querySelector('[data-testid="event-location"]')
    return {
      id: article.getAttribute('data-item-id') ?? '',
      title: (heading?.textContent ?? img?.getAttribute('alt') ?? '').trim(),
      date: time ? `${time.getAttribute('datetime')}|${time.textContent}` : (dateLine?.textContent ?? '').trim(),
      location: (location?.textContent ?? '').trim(),
      link: article.closest('a')?.getAttribute('href') ?? '',
    }
  })
}

/** Group heading texts and each item's deck slot (spec 08, FR-097 / FR-101). */
function groupMarkup(root: ParentNode) {
  return {
    headings: Array.from(root.querySelectorAll('section h2')).map(h => (h.textContent ?? '').replace(/\s+/g, ' ').trim()),
    slots: Array.from(root.querySelectorAll('li[data-slot]')).map(li => `${li.querySelector('article')?.getAttribute('data-item-id')}=${li.getAttribute('data-slot')}`),
    preview: Array.from(root.querySelectorAll('section[data-preview]')).map(s => s.id),
  }
}

function compare(path: string, siteSlug: string | null) {
  const kind = siteSlug ? 'site' : 'hub'
  cy.task<string>('renderSnapshot', {
    kind, path, siteSlug, sites: SITES_FIXTURE.sites, languages: LANGUAGES_FIXTURE.languages, items,
  }).then(html => {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const snapshot = tuples(parsed)
    expect(snapshot.map(t => t.id)).to.deep.equal(items.map(i => i.id))
    const snapshotGroups = groupMarkup(parsed)
    expect(snapshotGroups.headings).to.deep.equal(['Grupuri · 2', 'Evenimente · 4'])
    expect(snapshotGroups.slots).to.deep.equal(['p-ev-1=1', 'p-ev-3=0'])

    cy.visit(path)
    cy.get('[data-testid="content-list"]').should('exist')
    cy.document().then(doc => {
      expect(tuples(doc)).to.deep.equal(snapshot)
      expect(groupMarkup(doc)).to.deep.equal(snapshotGroups)
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
