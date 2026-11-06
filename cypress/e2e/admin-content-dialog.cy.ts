/**
 * Content create/edit dialog (spec 09, FR-110 – FR-114, BR-060): modal dialog, dismissal
 * rules with the discard confirmation, URL state, after-save landing and leave-page
 * protection (beforeunload while dirty, Back/Forward blocked by the in-app confirmation).
 */
import {
  beforeUnloadPrevented,
  clickBackdrop,
  contentItem,
  group,
  stubAdmin,
  visitAdmin,
} from '../support/helpers/admin'

const existing = contentItem('i1', 'Bun venit')
const created = contentItem('new-1', 'Seară de rugăciune', { orderPosition: 1 })

function openCreate() {
  cy.get('[data-testid="create-content-btn"]').click()
  cy.get('[data-testid="content-dialog"]').should('be.visible')
}

describe('Content dialog — create', () => {
  beforeEach(() => stubAdmin({ items: [existing] }))

  it('happy flow: opens as a modal, saves, lands on the new row', () => {
    visitAdmin()
    openCreate()
    cy.get('[data-testid="content-dialog"]')
      .should('have.attr', 'aria-modal', 'true')
      .and('contain', 'Element nou')
      .then($d => {
        expect($d[0].tagName).to.eq('DIALOG')
        expect($d[0].matches(':modal')).to.be.true
      })
    cy.location('search').should('eq', '?new=1')
    cy.focused().should('have.attr', 'data-testid', 'create-type-select')
    cy.document().its('documentElement.style.overflow').should('eq', 'hidden')
    cy.get('[data-testid="content-dialog"] [data-testid="create-form"]').should('exist')

    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: created }).as('create')
    cy.intercept('GET', '/api/admin/content', { items: [existing, created] }).as('refreshed')
    cy.get('[data-testid="create-title-input"]').type('Seară de rugăciune')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create')

    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="toast"]').should('contain', 'Element creat')
    cy.get('[data-testid="content-row-new-1"]').should('have.attr', 'data-highlight', 'true')
    cy.focused().should('have.attr', 'data-testid', 'content-name-new-1')
    cy.location('search').should('eq', '')
    cy.get('[data-testid="create-form"]').should('not.exist')
    cy.document().its('documentElement.style.overflow').should('eq', '')
    // The highlight fades out after 2.5 s.
    cy.get('[data-testid="content-row-new-1"]', { timeout: 4000 }).should('not.have.attr', 'data-highlight')
  })

  it('from a group header: preselects the group, expands it and highlights the new item', () => {
    const g = group('g1', 'Anunțuri')
    const inGroup = contentItem('new-g', 'În grup', { groupId: 'g1' })
    stubAdmin({ items: [existing], groups: [g] })
    visitAdmin()
    cy.get('[data-testid="collapse-toggle-g1"]').should('have.attr', 'aria-label', 'Extinde grup')
    cy.get('[data-testid="group-add-content-g1"]').click()
    cy.location('search').should('eq', '?new=1&group=g1')
    cy.get('[data-testid="content-dialog"]').should('be.visible')

    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: inGroup }).as('create')
    cy.intercept('GET', '/api/admin/content', { items: [existing, inGroup] })
    cy.get('[data-testid="create-title-input"]').type('În grup')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.groupId').should('eq', 'g1')
    cy.get('[data-testid="collapse-toggle-g1"]').should('have.attr', 'aria-label', 'Restrânge grup')
    cy.get('[data-testid="content-row-new-g"]').should('have.attr', 'data-highlight', 'true')
    cy.focused().should('have.attr', 'data-testid', 'content-name-new-g')
  })

  it('an unknown group id is ignored', () => {
    visitAdmin('/admin/content?new=1&group=missing')
    cy.get('[data-testid="content-dialog"]').should('be.visible')
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: created }).as('create')
    cy.get('[data-testid="create-title-input"]').type('X')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create').its('request.body.groupId').should('eq', null)
  })

  it('dismissal, clean: Esc, backdrop, × and "Anulează" close at once; focus returns to "+ Adaugă"', () => {
    visitAdmin()
    openCreate()
    cy.focused().type('{esc}')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    cy.focused().should('have.attr', 'data-testid', 'create-content-btn')

    openCreate()
    clickBackdrop('content-dialog')
    cy.get('[data-testid="content-dialog"]').should('not.exist')

    openCreate()
    cy.get('[data-testid="content-dialog-close"]').click()
    cy.get('[data-testid="content-dialog"]').should('not.exist')

    openCreate()
    cy.get('[data-testid="content-dialog-cancel"]').click()
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.location('search').should('eq', '')
  })

  it('dismissal, dirty: asks first; keep keeps the input; discard closes without a request', () => {
    cy.intercept('POST', '/api/admin/content', cy.spy().as('create'))
    visitAdmin()
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('Ciornă')
    cy.get('[data-testid="create-title-input"]').type('{esc}')
    cy.get('[data-testid="discard-confirm"]')
      .should('be.visible')
      .and('have.attr', 'role', 'alertdialog')
      .and('contain', 'Renunți la modificări?')
    cy.focused().should('have.attr', 'data-testid', 'discard-confirm-keep')

    cy.get('[data-testid="discard-confirm-keep"]').click()
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    cy.get('[data-testid="create-title-input"]').should('have.value', 'Ciornă')

    // Esc inside the confirmation means "Continuă editarea".
    cy.get('[data-testid="content-dialog-close"]').click()
    cy.focused().type('{esc}')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    cy.get('[data-testid="content-dialog"]').should('be.visible')

    clickBackdrop('content-dialog')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.get('[data-testid="discard-confirm-discard"]').click()
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('@create').should('not.have.been.called')
  })

  it('a field typed and reverted is not a change', () => {
    visitAdmin()
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('abc').clear()
    cy.get('[data-testid="create-title-input"]').type('{esc}')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
  })

  it('regression: a drag from the title field onto the backdrop does not close the dialog', () => {
    visitAdmin()
    openCreate()
    cy.get('[data-testid="create-title-input"]').trigger('pointerdown', { button: 0 })
    cy.get('[data-testid="content-dialog"]').trigger('pointerup', 5, 5).trigger('click', 5, 5)
    cy.get('[data-testid="content-dialog"]').should('be.visible')
  })

  it('a validation or server error keeps the dialog open with the input', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 400, body: { error: 'Titlul este obligatoriu' } }).as('create')
    visitAdmin()
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('X')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create')
    cy.get('[data-testid="content-dialog"]').should('be.visible').and('contain', 'Titlul este obligatoriu')
    cy.get('[data-testid="create-title-input"]').should('have.value', 'X')
  })

  it('nested: the media library opens on top and Esc closes only the library', () => {
    visitAdmin()
    openCreate()
    cy.contains('button', 'Alege din librărie').click()
    cy.get('dialog[open]').should('have.length', 2)
    cy.get('[data-testid="media-library-dialog"]').should('be.visible')
    cy.focused().type('{esc}')
    cy.get('[data-testid="media-library-dialog"]').should('not.exist')
    cy.get('dialog[open]').should('have.length', 1)
    cy.get('[data-testid="content-dialog"]').should('be.visible')
  })

  it('phone: a full-screen sheet with visible footer actions; the FAB is hidden', () => {
    cy.viewport(375, 812)
    visitAdmin()
    cy.get('[data-testid="nav-fab"]').should('be.visible')
    openCreate()
    cy.get('[data-testid="content-dialog"] [data-dialog-panel]').then($p => {
      const r = $p[0].getBoundingClientRect()
      expect(r.width).to.be.closeTo(375, 1)
      expect(r.height).to.be.closeTo(812, 1)
    })
    cy.get('[data-testid="create-submit-btn"]').should('be.visible')
    cy.get('[data-testid="content-dialog-cancel"]').should('be.visible')
    cy.get('[data-testid="nav-fab"]').should('not.be.visible')
  })
})

describe('Content dialog — deep links and edit', () => {
  beforeEach(() => stubAdmin({ items: [existing] }))

  it('a pasted ?new=1 opens an empty dialog; Back on an untouched form closes it', () => {
    visitAdmin('/admin/content?new=1')
    cy.get('[data-testid="content-dialog"]').should('be.visible')
    cy.get('[data-testid="create-title-input"]').should('have.value', '')
    cy.go('back')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
  })

  it('?edit=<missing> shows "Elementul nu mai există" and cleans the URL', () => {
    visitAdmin('/admin/content?edit=missing')
    cy.get('[data-testid="toast"]').should('contain', 'Elementul nu mai există')
    cy.location('search').should('eq', '')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
  })

  it('edit: the item name opens the edit layout; saving closes and highlights the row', () => {
    cy.intercept('PATCH', '/api/admin/content/i1', { ...existing, data: { title: 'Bun venit!' } }).as('save')
    visitAdmin()
    cy.get('[data-testid="content-name-i1"]').click()
    cy.location('search').should('eq', '?edit=i1')
    cy.get('[data-testid="content-dialog"]')
      .should('contain', 'Editează element')
      .and('contain', 'Bun venit')
      .find('[data-testid="edit-form"]').should('exist')
    cy.get('[data-testid="tab-edit"]').should('exist')
    cy.get('[data-testid="tab-short-links"]').should('exist')
    cy.get('[data-testid="create-title-input"]').clear().type('Bun venit!')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@save')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="toast"]').should('contain', 'Salvat')
    cy.get('[data-testid="content-row-i1"]').should('have.attr', 'data-highlight', 'true')
    cy.focused().should('have.attr', 'data-testid', 'content-name-i1')
  })

  it('edit inside a group keeps the group expanded', () => {
    const g = group('g1', 'Anunțuri')
    const inGroup = contentItem('gi', 'În grup', { groupId: 'g1' })
    stubAdmin({ items: [inGroup], groups: [g] })
    visitAdmin()
    cy.get('[data-testid="collapse-toggle-g1"]').click()
    cy.get('[data-testid="item-menu-trigger-gi"]').click()
    cy.get('[data-testid="item-menu-edit-gi"]').click()
    cy.get('[data-testid="content-dialog"] [data-testid="edit-form"]').should('exist')
    cy.get('[data-testid="content-dialog-close"]').click()
    cy.get('[data-testid="collapse-toggle-g1"]').should('have.attr', 'aria-label', 'Restrânge grup')
  })
})

describe('Content dialog — leave-page protection (FR-113, BR-060)', () => {
  beforeEach(() => stubAdmin({ items: [existing] }))

  it('beforeunload is prevented only while the form is dirty', () => {
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: created }).as('create')
    visitAdmin()
    openCreate()
    beforeUnloadPrevented().should('eq', false)
    cy.get('[data-testid="create-title-input"]').type('Ciornă')
    beforeUnloadPrevented().should('eq', true)

    cy.get('[data-testid="content-dialog-close"]').click()
    cy.get('[data-testid="discard-confirm-discard"]').click()
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    beforeUnloadPrevented().should('eq', false)

    openCreate()
    cy.get('[data-testid="create-title-input"]').type('Seară de rugăciune')
    beforeUnloadPrevented().should('eq', true)
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.wait('@create')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    beforeUnloadPrevented().should('eq', false)
  })

  it('Back with a dirty form keeps the dialog, restores the URL and asks; "Renunță" completes it', () => {
    cy.intercept('GET', '/api/admin/media*', { media: [] })
    visitAdmin('/admin/media')
    cy.get('[data-testid="nav-content"]').click()
    cy.location('pathname').should('eq', '/admin/content')
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('Ciornă')

    cy.go('back')
    cy.location('search').should('eq', '?new=1')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.get('[data-testid="create-title-input"]').should('have.value', 'Ciornă')

    cy.get('[data-testid="discard-confirm-keep"]').click()
    cy.get('[data-testid="content-dialog"]').should('be.visible')
    cy.location('search').should('eq', '?new=1')

    cy.go('back')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.get('[data-testid="discard-confirm-discard"]').click()
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '')
    cy.get('[data-testid="content-dialog"]').should('not.exist')

    // No extra history entries were left behind.
    cy.go('back')
    cy.location('pathname').should('eq', '/admin/media')
  })

  it('a multi-step traversal (go -2) is undone and replayed exactly on "Renunță"', () => {
    // The guard works on history deltas, so Back, Forward and multi-step jumps are handled
    // alike: the traversal is reverted (history keeps its shape) and replayed on discard.
    // (Through the UI a dirty dialog never has a forward entry: opening one always pushes.)
    cy.intercept('GET', '/api/admin/media*', { media: [] })
    visitAdmin('/admin/media')
    cy.get('[data-testid="nav-content"]').click()
    cy.location('pathname').should('eq', '/admin/content')
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('Ciornă')
    cy.go(-2)
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '?new=1')
    cy.get('[data-testid="discard-confirm-discard"]').click()
    cy.location('pathname').should('eq', '/admin/media')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.go('forward')
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '')
  })

  it('Forward back into a dialog URL reopens it (clean), and a dirty one then guards Back', () => {
    visitAdmin('/admin/content?new=1')
    cy.get('[data-testid="content-dialog"]').should('be.visible')
    cy.go('back')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.go('forward')
    cy.get('[data-testid="content-dialog"]').should('be.visible')
    cy.get('[data-testid="create-title-input"]').type('Ciornă')
    cy.go('back')
    cy.get('[data-testid="discard-confirm"]').should('be.visible')
    cy.location('search').should('eq', '?new=1')
    cy.get('[data-testid="discard-confirm-keep"]').click()
    cy.get('[data-testid="create-title-input"]').should('have.value', 'Ciornă')
  })

  it('regression: Back during a save is dropped; only the dialog close moves the URL', () => {
    cy.intercept('GET', '/api/admin/media*', { media: [] })
    cy.intercept('POST', '/api/admin/content', { statusCode: 201, body: created, delay: 600 }).as('create')
    cy.intercept('GET', '/api/admin/content', { items: [existing, created] })
    visitAdmin('/admin/media')
    cy.get('[data-testid="nav-content"]').click()
    openCreate()
    cy.get('[data-testid="create-title-input"]').type('Seară de rugăciune')
    cy.get('[data-testid="create-submit-btn"]').click()
    cy.go('back')
    cy.location('search').should('eq', '?new=1')
    cy.wait('@create')

    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    cy.get('[data-testid="content-row-new-1"]').should('have.attr', 'data-highlight', 'true')
    cy.location('pathname').should('eq', '/admin/content')
    cy.location('search').should('eq', '')
    // The replayed Back would have stacked on the close and left the page.
    cy.wait(300)
    cy.location('pathname').should('eq', '/admin/content')
    cy.go('back')
    cy.location('pathname').should('eq', '/admin/media')
  })

  it('regression: a clean dialog never blocks', () => {
    visitAdmin()
    openCreate()
    cy.go('back')
    cy.get('[data-testid="content-dialog"]').should('not.exist')
    cy.get('[data-testid="discard-confirm"]').should('not.exist')
    beforeUnloadPrevented().should('eq', false)
  })
})
