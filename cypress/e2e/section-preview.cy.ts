/**
 * Spec 08 — section preview (swipeable card deck) on phones: FR-096 – FR-103.
 * Below 640 px a group with 4+ visible items collapses into a deck of 2 full cards (pinned
 * items first) that swipes through the whole group, with "Vezi toate · N" / "Arată mai
 * puțin"; a group can opt out; every group heading shows its item count.
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

/** A horizontal (or, with `dy`, diagonal) touch drag across the deck. */
function drag(slug: string, dx: number, dy = 0) {
  section(slug).find('ul[data-preview-list]').then($ul => {
    const r = $ul[0].getBoundingClientRect()
    const x0 = r.left + r.width / 2
    const y0 = r.top + Math.min(120, r.height / 2)
    const at = (f: number) => ({ eventConstructor: 'PointerEvent', pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: x0 + dx * f, clientY: y0 + dy * f, force: true })
    cy.wrap($ul)
      .trigger('pointerdown', at(0))
      .trigger('pointermove', at(0.1))
      .trigger('pointermove', at(0.6))
      .trigger('pointermove', at(1))
      .trigger('pointerup', at(1))
  })
  // Settled: no swipe styles left on any card.
  section(slug).find('li[style*="transform"], li[style*="opacity"]').should('not.exist')
}

function visitWith(items: object[]) {
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
  cy.visit('/')
  cy.wait('@content')
}

describe('Section preview — phone card deck', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.viewport(375, 812)
  })

  it('collapses a long group into a deck of 2 full cards with the pinned item on top', () => {
    visitWith(feed())
    section('evenimente').should('have.attr', 'data-preview', 'hand')
    section('evenimente').find('h2').should('have.text', 'Evenimente · 5')
    section('evenimente').find('[data-testid="deck-count"]').should('have.text', '1 / 5').and('have.attr', 'aria-hidden', 'true')
    li('E').should('have.attr', 'data-slot', '0').and('be.visible').and('not.have.attr', 'aria-hidden')
    li('A').should('have.attr', 'data-slot', '1').and('be.visible').and('have.attr', 'aria-hidden', 'true')
    ;['B', 'C', 'D'].forEach(id => li(id).should('not.be.visible').and('not.have.attr', 'data-slot'))
    // The top card is the full card: date row, image and title as in the open list.
    li('E').find('time').should('be.visible')
    li('E').find('img').should('be.visible')
    li('E').find('h3').should('have.css', 'font-size', '20px')
    // One tab stop for the top card, then the button: the back card's link is out of the tab order.
    li('A').find('a').should('have.attr', 'tabindex', '-1')
    section('evenimente').then($s => {
      const stops = $s.find('a[href], button').filter((_, el) =>
        el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
      expect(stops.map((_, el) => el.getAttribute('href') ?? el.textContent?.trim()).get()).to.deep.equal(['https://example.com/E', 'Vezi toate · 5'])
    })
    // No tile-only markup is left.
    section('evenimente').find('[data-tile]').should('not.exist')
  })

  it('every deck card is as tall as the group\'s tallest card, so none is cut off (regression)', () => {
    const items = feed().map(i => (i.id === 'C'
      ? { ...i, data: { ...i.data, description: 'Un text lung care face cardul cel mai înalt din grup. '.repeat(12) } }
      : i))
    visitWith(items)
    // C (not in the deck yet) sets the height; its card is laid out but invisible.
    li('C').should('have.css', 'visibility', 'hidden')
    li('C').then($c => {
      const tallest = $c[0].offsetHeight
      expect(tallest).to.be.greaterThan(500)
      li('E').should($e => expect($e[0].offsetHeight).to.equal(tallest))
      li('A').should($a => expect($a[0].offsetHeight).to.equal(tallest))
      li('C').find('article').should($art => expect($art[0].scrollHeight).to.be.at.most($art[0].clientHeight + 1))
      drag('evenimente', -200)
      drag('evenimente', -200)
      li('B').should('have.attr', 'data-slot', '0').and($b => expect($b[0].offsetHeight).to.equal(tallest))
      li('C').should('have.attr', 'data-slot', '1').and('have.css', 'visibility', 'visible')
    })
  })

  it('a swipe either way deals the next card; the deck wraps around', () => {
    visitWith(feed())
    drag('evenimente', -200)
    li('A').should('have.attr', 'data-slot', '0').and('not.have.attr', 'aria-hidden')
    li('B').should('have.attr', 'data-slot', '1').and('have.attr', 'aria-hidden', 'true')
    li('E').should('not.be.visible')
    li('A').find('a').should('not.have.attr', 'tabindex')
    section('evenimente').find('[data-testid="deck-count"]').should('have.text', '2 / 5')
    drag('evenimente', 200)
    li('B').should('have.attr', 'data-slot', '0')
    section('evenimente').find('[data-testid="deck-count"]').should('have.text', '3 / 5')
    drag('evenimente', -200)
    drag('evenimente', -200)
    li('D').should('have.attr', 'data-slot', '0')
    li('E').should('have.attr', 'data-slot', '1')
    drag('evenimente', -200)
    li('E').should('have.attr', 'data-slot', '0')
    section('evenimente').find('[data-testid="deck-count"]').should('have.text', '1 / 5')
    // Swiping never opens a card's link.
    cy.get('@events.all').then(calls => {
      const clicks = (calls as unknown as Array<{ request: { body: { type?: string } } }>).filter(c => c.request.body?.type === 'link_click')
      expect(clicks).to.have.length(0)
    })
    section('evenimente').should('have.attr', 'data-preview', 'hand')
  })

  it('a short or vertical drag leaves the deck as it was', () => {
    visitWith(feed())
    // Short of the commit distance, and too short to count as a fling.
    drag('evenimente', -25)
    li('E').should('have.attr', 'data-slot', '0')
    drag('evenimente', 30, 200)
    li('E').should('have.attr', 'data-slot', '0')
    section('evenimente').find('ul').should('have.css', 'touch-action', 'pan-y')
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
    section('evenimente').find('[data-testid="deck-count"]').should('not.exist')
    cy.contains('button', 'Arată mai puțin').should('have.attr', 'aria-expanded', 'true')
    li('A').find('a').should('not.have.attr', 'tabindex')

    // Taps are ignored while the cards fly (busy flag); wait until the FLIP styles are gone.
    section('evenimente').find('li[style*="transform"]').should('not.exist')
    // The end of the group is below the fold: the button floats inside the viewport (sticky).
    li('A').then($li => cy.window().then(win => win.scrollTo(0, $li.offset()!.top - 100)))
    cy.contains('button', 'Arată mai puțin').should($b => {
      const rect = $b[0].getBoundingClientRect()
      expect(rect.bottom).to.be.lessThan(812)
      expect(rect.top).to.be.greaterThan(600)
    })
    cy.contains('button', 'Arată mai puțin').click()
    section('evenimente').should('have.attr', 'data-preview', 'hand')
    li('C').should('not.be.visible')
    cy.focused().should('have.text', 'Vezi toate · 5')
    cy.get('[data-testid="section-live"]').should('have.text', 'Evenimente: se afișează 2 din 5')
  })

  it('the deck never makes the page scroll sideways (regression)', () => {
    visitWith(feed())
    section('evenimente').find('li[data-slot]').each($li => {
      const rect = $li[0].getBoundingClientRect()
      expect(rect.left).to.be.at.least(0)
      expect(rect.right).to.be.at.most(375)
    })
    cy.document().should(doc => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(375)
    })
    // The back card carries the "more cards" stack; the button has no dash.
    li('A').should('have.css', 'box-shadow').and('match', /8px 8px/)
    cy.contains('button', 'Vezi toate · 5').then($b => {
      expect(getComputedStyle($b[0], '::before').content).to.be.oneOf(['none', 'normal'])
    })
  })

  it('the top card keeps its own link', () => {
    visitWith(feed())
    cy.document().then(doc => {
      doc.addEventListener('click', e => {
        ;(doc as unknown as { lastClickPrevented?: boolean }).lastClickPrevented = e.defaultPrevented
        e.preventDefault() // stay on the page
      })
    })
    li('E').find('a').click()
    cy.document().its('lastClickPrevented').should('equal', false)
    section('evenimente').should('have.attr', 'data-preview', 'hand')
  })

  it('a tap on a top card without a link opens the group at that card', () => {
    const NI = { groupId: 'g-ni', groupTitle: 'Implicare' }
    visitWith(['1', '2', '3', '4', '5', '6'].map(n => card(`N${n}`, NI, {
      title: `Implicare ${n}`, link: undefined,
      description: 'Completează acest formular, iar cineva te va contacta. '.repeat(n === '5' ? 6 : 1),
    })))
    drag('implicare', -200)
    drag('implicare', -200)
    drag('implicare', -200)
    drag('implicare', -200)
    li('N5').should('have.attr', 'data-slot', '0').find('h3').click()
    section('implicare').should('have.attr', 'data-preview', 'open')
    section('implicare').find('li[style*="transform"]').should('not.exist')
    li('N5').should($li => {
      const rect = $li[0].getBoundingClientRect()
      expect(rect.top).to.be.at.least(0)
      expect(rect.top).to.be.lessThan(812)
    })
    cy.focused().closest('li').find('[data-item-id]').should('have.attr', 'data-item-id', 'N5')
  })

  it('a tap on the back card opens the group and scrolls to it instead of following its link', () => {
    visitWith(feed())
    // The back card peeks out at the right of the top card.
    li('A').find('[data-hand-expand]').then($o => {
      const { width, height } = $o[0].getBoundingClientRect()
      cy.wrap($o).click(width - 6, height / 2)
    })
    section('evenimente').should('have.attr', 'data-preview', 'open')
    section('evenimente').find('li[style*="transform"]').should('not.exist')
    li('A').should($li => {
      const rect = $li[0].getBoundingClientRect()
      expect(rect.top).to.be.at.least(0)
      expect(rect.bottom).to.be.at.most(812)
    })
    cy.focused().should('have.attr', 'href', 'https://example.com/A')
    cy.get('@events.all').then(calls => {
      const clicks = (calls as unknown as Array<{ request: { body: { type?: string } } }>).filter(c => c.request.body?.type === 'link_click')
      expect(clicks).to.have.length(0)
    })
    // Open: the overlay no longer intercepts, the link is clickable again.
    li('A').find('[data-hand-expand]').should('have.css', 'pointer-events', 'none')
    li('A').find('a').should('not.have.attr', 'tabindex')
  })

  it('keeps the deck stacking while the cards fly out, then clears it (regression: flicker)', () => {
    visitWith(feed())
    cy.contains('button', 'Vezi toate · 5').click()
    const z = ($li: JQuery<HTMLElement>) => Number(getComputedStyle($li[0]).zIndex)
    li('E').then($e => li('A').then($a => li('B').then($b => {
      expect(z($e)).to.be.greaterThan(z($a))
      expect(z($a)).to.be.greaterThan(z($b))
    })))
    li('A').should('have.attr', 'style').and('contain', 'box-shadow')
    section('evenimente').find('li[style*="transform"]').should('not.exist')
    ;['A', 'B', 'C', 'E'].forEach(id => li(id).should($li => {
      expect($li[0].style.zIndex).to.equal('')
      expect($li[0].style.boxShadow).to.equal('')
    }))
  })

  it('a pinned last item tops the deck and leaves it at once (regression)', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, i) => card(id, EV, {
      title: `Eveniment ${id}`, startDate: isoDay(i + 3), thumbnail: THUMB,
    }, { pinnedInGroup: id === 'G' }))
    visitWith(items)
    li('G').should('have.attr', 'data-slot', '0')
    li('A').should('have.attr', 'data-slot', '1')
    cy.contains('button', 'Vezi toate · 7').click()
    const delay = (id: string) => li(id).then($li => parseFloat(getComputedStyle($li[0]).transitionDelay))
    delay('G').should('equal', 0)
    delay('A').should('be.lessThan', 0.05)
    delay('B').should('be.at.least', 0.05)
    section('evenimente').find('li[style*="transform"]').should('not.exist')
    li('G').should('have.css', 'opacity', '1')
  })

  it('small groups, opted-out groups and ungrouped items are never collapsed (regression)', () => {
    const OFF = { groupId: 'g-off', groupTitle: 'Anunțuri', groupPreview: false }
    visitWith([...feed(), ...['1', '2', '3', '4', '5'].map(n => card(`O${n}`, OFF, { title: `Anunț ${n}` }))])
    section('comunitate').should('not.have.attr', 'data-preview')
    section('comunitate').find('h2').should('have.text', 'Comunitate · 3')
    section('comunitate').find('li').should('have.length', 3).each($li => cy.wrap($li).should('be.visible'))
    section('comunitate').find('button').should('not.exist')
    section('anunturi').should('not.have.attr', 'data-preview')
    section('anunturi').find('h2').should('have.text', 'Anunțuri · 5')
    section('anunturi').find('li').should('have.length', 5).each($li => cy.wrap($li).should('be.visible').and('not.have.attr', 'data-slot'))
    section('anunturi').find('button, [data-testid="deck-count"]').should('not.exist')
    cy.get('[data-item-id="R"]').should('be.visible').closest('section').should('not.exist')
    cy.get('[data-item-id="R"] h2').should('have.text', 'Program')
  })

  it('shows the full grid on desktop with the count and no buttons (regression)', () => {
    cy.viewport(1000, 800)
    visitWith(feed())
    section('evenimente').find('h2').should('have.text', 'Evenimente · 5')
    ;['A', 'B', 'C', 'D', 'E'].forEach(id => li(id).should('be.visible').and('not.have.attr', 'aria-hidden'))
    li('A').find('a').should('not.have.attr', 'tabindex')
    cy.contains('button', 'Vezi toate').should('not.be.visible')
    section('evenimente').find('[data-testid="deck-count"]').should('not.be.visible')
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

  it('with several pins the pinned items lead in group order (regression)', () => {
    visitWith(feed({ B: true, C: true, D: true, E: true }))
    li('B').should('have.attr', 'data-slot', '0')
    li('C').should('have.attr', 'data-slot', '1')
    drag('evenimente', -200)
    drag('evenimente', -200)
    li('D').should('have.attr', 'data-slot', '0')
    li('E').should('have.attr', 'data-slot', '1')
    drag('evenimente', -200)
    li('A').should('have.attr', 'data-slot', '1')
  })

  it('treats items without pinnedInGroup (old API) as unpinned (regression)', () => {
    visitWith(feed().map(({ pinnedInGroup: _p, ...rest }) => rest))
    li('A').should('have.attr', 'data-slot', '0')
    li('B').should('have.attr', 'data-slot', '1')
  })

  it('a poster keeps its own aspect in the deck and when expanded', () => {
    const PO = { groupId: 'g-po', groupTitle: 'Afișe' }
    visitWith(['1', '2', '3', '4'].map(n => ({
      ...baseItem, ...PO, id: `P${n}`, type: 'poster', data: { imageUrl: '/icons/icon-512.png', alt: `Afiș ${n}` },
    })))
    const square = () => li('P1').find('img').should($img => {
      const img = $img[0] as HTMLImageElement
      expect(img.naturalWidth).to.be.greaterThan(0)
      expect(img.offsetHeight / img.offsetWidth).to.be.closeTo(1, 0.02)
    })
    square()
    cy.contains('button', 'Vezi toate · 4').click()
    square()
  })
})
