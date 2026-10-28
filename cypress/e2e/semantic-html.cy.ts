/**
 * Spec 03 FR-072 — semantic-HTML baseline of the public hub.
 */
import { baseItem, stubPublicBasics } from '../support/helpers/public'

const items = [
  { ...baseItem, id: 'root-card', type: 'card', data: { title: 'Card la rădăcină', thumbnail: '/icons/icon-512.png', startDate: '2099-01-10' } },
  { ...baseItem, id: 'grp-card', type: 'card', groupId: 'g1', groupTitle: 'Grupuri', data: { title: 'Card în grup', thumbnail: '/icons/icon-192.png' } },
  { ...baseItem, id: 'grp-poster', type: 'poster', groupId: 'g1', groupTitle: 'Grupuri', data: { imageUrl: '/icons/icon-192.png', alt: 'Afiș' } },
  { ...baseItem, id: 'root-text', type: 'richtext', data: { title: 'Program', body: 'Duminică 10:00' } },
]

describe('Semantic HTML baseline', () => {
  beforeEach(() => {
    stubPublicBasics()
    cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
    cy.visit('/')
    cy.wait('@content')
    cy.get('[data-testid="content-list"]').should('exist')
  })

  it('has exactly one h1 and the main landmarks', () => {
    cy.get('h1').should('have.length', 1)
    cy.get('header').should('exist')
    cy.get('nav').should('have.attr', 'aria-label', 'Locații')
    cy.get('main').should('have.attr', 'aria-label', 'Conținut')
    cy.get('footer').should('exist')
  })

  it('never skips a heading level in the feed', () => {
    cy.get('main section').each($section => {
      cy.wrap($section).find('h2').should('have.length', 1)
      cy.wrap($section).find('article h3').should('have.length.at.least', 1)
      cy.wrap($section).find('article h2').should('not.exist')
    })
    cy.get('[data-item-id="root-card"] h2').should('contain', 'Card la rădăcină')
    cy.get('[data-item-id="root-text"] h2').should('contain', 'Program')
    cy.get('h4, h5, h6').should('not.exist')
  })

  it('gives every image an alt attribute and no aria-hidden contradiction', () => {
    cy.get('img').each($img => {
      expect($img[0].hasAttribute('alt'), $img.attr('src')).to.equal(true)
      if ($img.attr('alt')) expect($img.attr('aria-hidden')).to.not.equal('true')
    })
  })

  it('reserves space for feed images and lazy-loads all but the first', () => {
    cy.get('main img').each(($img, i) => {
      const hasDims = !!$img.attr('width') && !!$img.attr('height')
      const inAspectBox = $img.parents('[class*="aspect-"]').length > 0
      expect(hasDims || inAspectBox, `image ${i} dimensions`).to.equal(true)
      if (i === 0) {
        expect($img.attr('loading')).to.be.undefined
        expect($img.attr('fetchpriority')).to.equal('high')
      } else {
        expect($img.attr('loading')).to.equal('lazy')
      }
    })
  })

  it('marks dates up with <time datetime>', () => {
    cy.get('[data-item-id="root-card"] time').should('have.attr', 'datetime', '2099-01-10')
  })
})
