/**
 * Spec 08 — section preview ("hand of cards") on phones: FR-096 – FR-102.
 * Below 640 px a group with 4+ visible items collapses into a fanned hand of 3 tiles
 * (pinned items first), with "Vezi toate · N" / "Arată mai puțin"; every group heading
 * shows its item count.
 */
import { baseItem, isoDay, stubPublicBasics } from '../support/helpers/public'

const EV = { groupId: 'g-ev', groupTitle: 'Evenimente' }
const CO = { groupId: 'g-co', groupTitle: 'Comunitate' }
const THUMB = '/icons/icon-192.png'

const card = (id: string, group: object, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ ...baseItem, ...group, ...extra, id, type: 'card', data: { link: `https://example.com/${id}`, ...data } })

/** Evenimente A–E (E pinned, B without thumbnail), Comunitate ×3, one ungrouped richtext. */
function feed(pins: Record<string, boolean> = { E: true }) {
  return [
    ...['A', 'B', 'C', 'D', 'E'].map((id, i) => card(id, EV, {
      title: `Eveniment ${id}`,
      startDate: isoDay(i + 3),
      ...(id === 'B' ? {} : { thumbnail: THUMB }),
    }, { pinnedInGroup: !!pins[id] })),
    ...['X', 'Y', 'Z'].map(id => card(id, CO, { title: `Comunitate ${id}` })),
    { ...baseItem, id: 'R', type: 'richtext', data: { title: 'Program', body: 'Duminică **10:00**' } },
  ]
}

const li = (id: string) => cy.get(`[data-item-id="${id}"]`).closest('li')
const section = (slug: string) => cy.get(`section#${slug}`)

function visitWith(items: object[]) {
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  cy.visit('/')
  cy.wait('@content')
}

describe('Section preview — phone hand of cards', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.viewport(375, 812)
  })

  it('collapses a long group into a hand of 3 with the pinned item in front', () => {
    visitWith(feed())
    section('evenimente').should('have.attr', 'data-preview', 'hand')
    section('evenimente').find('h2').should('have.text', 'Evenimente · 5')
    li('E').should('have.attr', 'data-slot', '0').and('be.visible').and('not.have.attr', 'aria-hidden')
    li('A').should('have.attr', 'data-slot', '1').and('be.visible').and('have.attr', 'aria-hidden', 'true')
    li('B').should('have.attr', 'data-slot', '2').and('be.visible').and('have.attr', 'aria-hidden', 'true')
    li('C').should('not.be.visible')
    li('D').should('not.be.visible')
    // One tab stop for the front tile, then the button: back tiles' links are out of the tab order.
    li('A').find('a').should('have.attr', 'tabindex', '-1')
    li('B').find('a').should('have.attr', 'tabindex', '-1')
    section('evenimente').then($s => {
      const stops = $s.find('a[href], button').filter((_, el) => el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null)
      expect(stops.map((_, el) => el.getAttribute('href') ?? el.textContent?.trim()).get()).to.deep.equal(['https://example.com/E', 'Vezi toate · 5'])
    })
    // B has no thumbnail: typographic date cover; E has one: corner date index.
    li('B').find('[data-tile="cover"]').should('be.visible').and('have.attr', 'aria-hidden', 'true')
    li('E').find('[data-tile="index"]').should('be.visible')
    // Description / CTA hidden in a tile.
    li('E').find('[data-tile="title"]').should('have.css', '-webkit-line-clamp', '3')
  })

  it('expands with the button and collapses with the floating "Arată mai puțin"', () => {
    visitWith(feed())
    cy.contains('button', 'Vezi toate · 5')
      .should('have.attr', 'aria-expanded', 'false')
      .and('have.attr', 'aria-controls')
    cy.contains('button', 'Vezi toate · 5').click()
    section('evenimente').should('have.attr', 'data-preview', 'open')
    ;['A', 'B', 'C', 'D', 'E'].forEach(id => li(id).should('be.visible').and('not.have.attr', 'aria-hidden'))
    section('evenimente').find('li article').then($a => {
      expect($a.map((_, el) => el.getAttribute('data-item-id')).get()).to.deep.equal(['A', 'B', 'C', 'D', 'E'])
    })
    cy.focused().should('have.attr', 'href', 'https://example.com/A')
    cy.get('[data-testid="section-live"]').should('have.text', 'Evenimente: se afișează toate cele 5')
    cy.contains('button', 'Vezi toate').should('not.exist')
    cy.contains('button', 'Arată mai puțin').should('have.attr', 'aria-expanded', 'true')
    li('A').find('a').should('not.have.attr', 'tabindex')
    li('B').find('[data-tile="cover"]').should('not.be.visible')

    // Taps are ignored while the cards fly (busy flag); wait until the FLIP styles are gone.
    section('evenimente').find('li[style*="transform"]').should('not.exist')
    // The end of the group is below the fold: the button floats inside the viewport (sticky).
    li('A').then($li => window.scrollTo(0, $li.offset()!.top - 100))
    cy.contains('button', 'Arată mai puțin').should($b => {
      const rect = $b[0].getBoundingClientRect()
      expect(rect.bottom).to.be.lessThan(812)
      expect(rect.top).to.be.greaterThan(600)
    })
    cy.contains('button', 'Arată mai puțin').click()
    section('evenimente').should('have.attr', 'data-preview', 'hand')
    li('C').should('not.be.visible')
    cy.focused().should('have.text', 'Vezi toate · 5')
    cy.get('[data-testid="section-live"]').should('have.text', 'Evenimente: se afișează 3 din 5')
  })

  it('a tap on a back tile expands the group instead of following its link', () => {
    visitWith(feed())
    // Clicking the visible right edge of tile A hits its [data-hand-expand] overlay, not its link.
    li('A').find('[data-hand-expand]').click('right')
    section('evenimente').should('have.attr', 'data-preview', 'open')
    cy.get('@events.all').then(calls => {
      const clicks = (calls as unknown as Array<{ request: { body: { type?: string } } }>).filter(c => c.request.body?.type === 'link_click')
      expect(clicks).to.have.length(0)
    })
    // Open: the overlay no longer intercepts, the link is focusable and clickable again.
    li('A').find('[data-hand-expand]').should('have.css', 'pointer-events', 'none')
    li('A').find('a').should('not.have.attr', 'tabindex')
    li('A').find('a').scrollIntoView()
    li('A').find('a').should($a => {
      const rect = $a[0].getBoundingClientRect()
      const hit = $a[0].ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      expect($a[0].contains(hit)).to.equal(true)
    })
  })

  it('small groups and ungrouped items are never collapsed (regression)', () => {
    visitWith(feed())
    section('comunitate').should('not.have.attr', 'data-preview')
    section('comunitate').find('h2').should('have.text', 'Comunitate · 3')
    section('comunitate').find('li').should('have.length', 3).each($li => cy.wrap($li).should('be.visible'))
    section('comunitate').find('button').should('not.exist')
    cy.get('[data-item-id="R"]').should('be.visible').closest('section').should('not.exist')
    cy.get('[data-item-id="R"] h2').should('have.text', 'Program')
  })

  it('shows the full grid on desktop with the count and no buttons (regression)', () => {
    cy.viewport(1000, 800)
    visitWith(feed())
    section('evenimente').find('h2').should('have.text', 'Evenimente · 5')
    ;['A', 'B', 'C', 'D', 'E'].forEach(id => li(id).should('be.visible').and('not.have.attr', 'aria-hidden'))
    li('A').find('a').should('not.have.attr', 'tabindex')
    li('B').find('[data-tile="cover"]').should('not.be.visible')
    cy.contains('button', 'Vezi toate').should('not.be.visible')
  })

  it('switches layouts when crossing 640 px while collapsed (regression)', () => {
    visitWith(feed())
    li('C').should('not.be.visible')
    cy.viewport(1000, 800)
    ;['A', 'B', 'C', 'D', 'E'].forEach(id => li(id).should('be.visible'))
    li('A').should('not.have.attr', 'aria-hidden')
    cy.viewport(375, 812)
    li('C').should('not.be.visible')
    li('A').should('have.attr', 'aria-hidden', 'true')
    section('evenimente').should('have.attr', 'data-preview', 'hand')
  })

  it('with four pins the first three pinned in group order lead (regression)', () => {
    visitWith(feed({ B: true, C: true, D: true, E: true }))
    li('B').should('have.attr', 'data-slot', '0')
    li('C').should('have.attr', 'data-slot', '1')
    li('D').should('have.attr', 'data-slot', '2')
    li('A').should('not.be.visible').and('not.have.attr', 'data-slot')
    li('E').should('not.be.visible').and('not.have.attr', 'data-slot')
  })

  it('treats items without pinnedInGroup (old API) as unpinned (regression)', () => {
    visitWith(feed().map(({ pinnedInGroup: _p, ...rest }) => rest))
    li('A').should('have.attr', 'data-slot', '0')
    li('B').should('have.attr', 'data-slot', '1')
    li('C').should('have.attr', 'data-slot', '2')
  })

  it('crops a poster to its tile and restores its own aspect when expanded (regression)', () => {
    const PO = { groupId: 'g-po', groupTitle: 'Afișe' }
    visitWith(['1', '2', '3', '4'].map(n => ({
      ...baseItem, ...PO, id: `P${n}`, type: 'poster', data: { imageUrl: '/icons/icon-512.png', alt: `Afiș ${n}` },
    })))
    li('P1').find('img').should('have.css', 'object-fit', 'cover').and($img => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.greaterThan(0)
      // 5:6 tile (offset sizes ignore the slot rotation): taller than the square image.
      expect(img.offsetHeight / img.offsetWidth).to.be.closeTo(1.2, 0.05)
    })
    cy.contains('button', 'Vezi toate · 4').click()
    li('P1').find('img').should($img => {
      const img = $img[0] as HTMLImageElement
      expect(img.offsetHeight / img.offsetWidth).to.be.closeTo(1, 0.02)
    })
  })
})
