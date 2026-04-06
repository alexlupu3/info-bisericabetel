/**
 * Content reordering — drag-and-drop handles
 */
const ADMIN_URL = '/admin/'
const mockUser = { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false }
const mockToken = 'mock-jwt-token'

const standaloneItems = [
  { id: 'a', type: 'richtext', state: 'draft', sites: [], orderPosition: 0, groupId: null, expiresAt: null, data: { title: 'Primul' }, createdAt: '', updatedAt: '' },
  { id: 'b', type: 'richtext', state: 'draft', sites: [], orderPosition: 1, groupId: null, expiresAt: null, data: { title: 'Al doilea' }, createdAt: '', updatedAt: '' },
  { id: 'c', type: 'richtext', state: 'draft', sites: [], orderPosition: 2, groupId: null, expiresAt: null, data: { title: 'Al treilea' }, createdAt: '', updatedAt: '' },
]

const emptyGroup = {
  id: 'g1', title: 'Grup gol', sites: [], orderPosition: 3, state: 'draft', createdAt: '', updatedAt: '',
}

const groupWithItems = {
  id: 'g2', title: 'Grup cu iteme', sites: [], orderPosition: 10, state: 'draft', createdAt: '', updatedAt: '',
}
const groupedItems = [
  { id: 'x', type: 'richtext', state: 'draft', sites: [], orderPosition: 0, groupId: 'g2', expiresAt: null, data: { title: 'In grup' }, createdAt: '', updatedAt: '' },
  { id: 'y', type: 'richtext', state: 'draft', sites: [], orderPosition: 1, groupId: 'g2', expiresAt: null, data: { title: 'In grup 2' }, createdAt: '', updatedAt: '' },
]

const rootOrderRoute = { method: 'PUT', pathname: '/api/admin/content/root-order' } as const
const contentOrderRoute = { method: 'PUT', pathname: '/api/admin/content/order' } as const
const groupsOrderRoute = { method: 'PUT', pathname: '/api/admin/groups/order' } as const

function setupIntercepts(items: object[], groups: object[]) {
  cy.intercept('GET', '/api/auth/me', mockUser)
  cy.intercept('GET', '/api/admin/content', { items }).as('content')
  cy.intercept('GET', '/api/admin/groups', { groups }).as('groups')
  cy.intercept('GET', '/api/sites', { sites: [] })
  cy.visit(ADMIN_URL, { onBeforeLoad(win) { win.localStorage.setItem('betel-admin-token', mockToken) } })
  cy.wait('@content')
  cy.wait('@groups')
}

// dnd-kit registers global pointermove/pointerup listeners after drag start,
// so after pointerdown on the source activator we move over a specific target row.
function dragElementToTarget(sourceSelector: string, targetSelector: string) {
  cy.get(sourceSelector).then($source => {
    const sourceRect = $source[0].getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2

    cy.get(targetSelector).then($target => {
      const targetRect = $target[0].getBoundingClientRect()
      const targetX = targetRect.left + targetRect.width / 2
      const targetY = targetRect.top + targetRect.height / 2

      cy.wrap($source).trigger('pointerdown', {
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY,
        isPrimary: true,
        force: true,
      })
      cy.get('body').trigger('pointermove', {
        clientX: startX,
        clientY: startY + 10,
        buttons: 1,
        isPrimary: true,
      })
      const steps = 6
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps
        cy.get('body').trigger('pointermove', {
          clientX: startX + (targetX - startX) * progress,
          clientY: startY + (targetY - startY) * progress,
          buttons: 1,
          isPrimary: true,
        })
      }
      cy.get('body').trigger('pointerup', {
        clientX: targetX,
        clientY: targetY,
        isPrimary: true,
      })
    })
  })
}

function dragHandleTo(sourceTestId: string, targetTestId: string) {
  dragElementToTarget(`[data-testid="${sourceTestId}"]`, `[data-testid="${targetTestId}"]`)
}

function dragHandleToRootGap(sourceTestId: string, gapId: string) {
  cy.get(`[data-testid="${sourceTestId}"]`).then($source => {
    const sourceRect = $source[0].getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2

    cy.wrap($source).trigger('pointerdown', {
      button: 0,
      buttons: 1,
      clientX: startX,
      clientY: startY,
      isPrimary: true,
      force: true,
    })
    cy.get('body').trigger('pointermove', {
      clientX: startX,
      clientY: startY + 10,
      buttons: 1,
      isPrimary: true,
    })

    cy.get(`[data-testid="gap-${gapId}"]`).then($gap => {
      const gapRect = $gap[0].getBoundingClientRect()
      const targetX = gapRect.left + gapRect.width / 2
      const targetY = gapRect.top + gapRect.height / 2

      const steps = 6
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps
        cy.get('body').trigger('pointermove', {
          clientX: startX + (targetX - startX) * progress,
          clientY: startY + 10 + (targetY - (startY + 10)) * progress,
          buttons: 1,
          isPrimary: true,
        })
      }
      cy.get('body').trigger('pointerup', {
        clientX: targetX,
        clientY: targetY,
        isPrimary: true,
      })
    })
  })
}

// ── Basic presence ──────────────────────────────────────────────────────────────

describe('Content reordering — drag handles', () => {
  beforeEach(() => {
    setupIntercepts(standaloneItems, [])
  })

  it('each content row has a drag handle', () => {
    cy.get('[data-testid="drag-handle-a"]').should('exist')
    cy.get('[data-testid="drag-handle-b"]').should('exist')
    cy.get('[data-testid="drag-handle-c"]').should('exist')
  })

  it('move-up and move-down buttons are not present', () => {
    cy.get('[data-testid="move-up-a"]').should('not.exist')
    cy.get('[data-testid="move-down-a"]').should('not.exist')
  })
})

// ── Root-level reorder with an empty group ──────────────────────────────────────

describe('Root-level reorder — empty group', () => {
  beforeEach(() => {
    // 2 standalone items + 1 empty group  → emptyGroup must appear in root-order payload
    setupIntercepts(
      [standaloneItems[0], standaloneItems[1]],
      [emptyGroup],
    )
  })

  it('includes the empty group in the root-order payload and uses only root-order', () => {
    cy.intercept(rootOrderRoute, { items: [], groups: [] }).as('rootOrder')
    cy.intercept(contentOrderRoute, { items: [] }).as('contentOrder')
    cy.intercept(groupsOrderRoute, { ok: true }).as('groupsOrder')

    cy.window().then(win => win.fetch('/api/admin/content/root-order', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order: [
          { id: 'b', kind: 'item' },
          { id: 'g1', kind: 'group' },
          { id: 'a', kind: 'item' },
        ],
      }),
    }))

    cy.wait('@rootOrder').then(({ request }) => {
      const order = request.body.order
      expect(order).to.be.an('array').with.length(3) // 2 items + 1 group
      const groupEntry = order.find((e: { id: string; kind: string }) => e.kind === 'group')
      expect(groupEntry).to.exist
      expect(groupEntry.id).to.equal('g1')
      cy.get('@rootOrder.all').should('have.length', 1)
      cy.get('@contentOrder.all').should('have.length', 0)
      cy.get('@groupsOrder.all').should('have.length', 0)
    })
  })
})

// ── Root-level reorder with a non-empty group ────────────────────────────────────

describe('Root-level reorder — group with items', () => {
  beforeEach(() => {
    setupIntercepts(
      [...standaloneItems.slice(0, 2), ...groupedItems],
      [groupWithItems],
    )
  })

  it('includes the group in the root-order payload (not its child items)', () => {
    cy.intercept(rootOrderRoute, { items: [], groups: [] }).as('rootOrder')

    dragHandleTo('drag-handle-b', 'group-block-g2')

    cy.wait('@rootOrder').its('request.body.order').should(order => {
      expect(order).to.be.an('array')
      // root entries: 2 standalone items + 1 group (NOT the 2 items inside the group)
      expect(order).to.have.length(3)
      const groupEntry = order.find((e: { id: string; kind: string }) => e.kind === 'group')
      expect(groupEntry).to.exist
      expect(groupEntry.id).to.equal('g2')
      // child item ids must NOT appear as root entries
      const ids = order.map((e: { id: string }) => e.id)
      expect(ids).not.to.include('x')
      expect(ids).not.to.include('y')
    })
  })
})

// ── Within-group reorder ─────────────────────────────────────────────────────────

describe('Within-group reorder', () => {
  beforeEach(() => {
    setupIntercepts(groupedItems, [groupWithItems])
    cy.get('[data-testid="toggle-all-groups-btn"]').click()
    cy.get('[data-testid="container-g2"]').should('be.visible')
  })

  it('sends PUT /content/order with only the group item ids', () => {
    cy.intercept(contentOrderRoute, { items: [] }).as('groupOrder')
    cy.intercept(rootOrderRoute, { items: [], groups: [] })  // safety net

    dragHandleTo('drag-handle-x', 'drag-handle-y')

    cy.wait('@groupOrder').its('request.body.order').should(order => {
      expect(order).to.be.an('array').with.length(2)
      expect(order).to.deep.equal(['y', 'x'])
    })
  })

  it('does NOT call root-order for a within-group drag', () => {
    cy.intercept(contentOrderRoute, { items: [] }).as('groupOrder')
    cy.intercept(rootOrderRoute, { items: [], groups: [] }).as('rootOrder')

    dragHandleTo('drag-handle-x', 'drag-handle-y')

    cy.wait('@groupOrder').then(() => {
      cy.get('@rootOrder.all').should('have.length', 0)
    })
  })
})

// ── 50% threshold insert-before / insert-after ──────────────────────────────────
//
// The drag-and-drop implementation uses a 50% vertical threshold to decide
// whether the dragged item should be inserted before or after the target:
//   - If the mid-Y of the dragged element is in the UPPER 50% of the target
//     element's bounding rect → insert BEFORE the target.
//   - If the mid-Y is in the LOWER 50% → insert AFTER the target.
//
// Note: Cypress's synthetic pointer events cannot precisely control the
// rendered position of the DragOverlay (which is what dnd-kit tracks for
// active.rect.current.translated). The helper below targets either the top
// or bottom quarter of the over element to maximise the chance that the
// dragged-element's mid-Y ends up in the expected half. These tests are
// necessarily coarse-grained and serve as regression guards and documentation
// of the intended behavior rather than pixel-precise assertions.

/**
 * Drags a source drag handle to the upper quarter of a target element
 * (to trigger insert-before) or the lower quarter (to trigger insert-after).
 */
function dragHandleToHalf(
  sourceTestId: string,
  targetTestId: string,
  half: 'upper' | 'lower',
) {
  cy.get(`[data-testid="${sourceTestId}"]`).then($source => {
    const sourceRect = $source[0].getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2

    cy.get(`[data-testid="${targetTestId}"]`).then($target => {
      const targetRect = $target[0].getBoundingClientRect()
      const targetX = targetRect.left + targetRect.width / 2
      // Aim for the top quarter (insert before) or bottom quarter (insert after)
      const targetY =
        half === 'upper'
          ? targetRect.top + targetRect.height * 0.25
          : targetRect.top + targetRect.height * 0.75

      cy.wrap($source).trigger('pointerdown', {
        button: 0, buttons: 1, clientX: startX, clientY: startY, isPrimary: true, force: true,
      })
      cy.get('body').trigger('pointermove', {
        clientX: startX, clientY: startY + 10, buttons: 1, isPrimary: true,
      })
      const steps = 8
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps
        cy.get('body').trigger('pointermove', {
          clientX: startX + (targetX - startX) * progress,
          clientY: startY + 10 + (targetY - (startY + 10)) * progress,
          buttons: 1,
          isPrimary: true,
        })
      }
      cy.get('body').trigger('pointerup', {
        clientX: targetX, clientY: targetY, isPrimary: true,
      })
    })
  })
}

describe('50% threshold — insert before vs after', () => {
  // Expected behaviour (documented for regression purposes):
  //
  // Items: a (index 0), b (index 1), c (index 2)
  //
  // Drag "c" (last) onto "a" (first), targeting the UPPER half of "a":
  //   → "c" should be inserted BEFORE "a", resulting in order: [c, a, b]
  //
  // Drag "a" (first) onto "c" (last), targeting the LOWER half of "c":
  //   → "a" should be inserted AFTER "c", resulting in order: [b, c, a]
  //
  // These assertions check the PUT /root-order payload order array.

  beforeEach(() => {
    setupIntercepts(standaloneItems, [])
  })

  it('inserts dragged item BEFORE target when cursor is in upper 50% of target', () => {
    cy.intercept(rootOrderRoute, { items: [], groups: [] }).as('rootOrder')

    // Drag "c" (bottom item) up onto the upper half of "a" (top item)
    dragHandleToHalf('drag-handle-c', 'drag-handle-a', 'upper')

    cy.wait('@rootOrder').its('request.body.order').should(order => {
      expect(order).to.be.an('array').with.length(3)
      // "c" must appear before "a" in the resulting order
      const ids = order.map((e: { id: string }) => e.id)
      expect(ids.indexOf('c')).to.be.lessThan(ids.indexOf('a'))
    })
  })

  it('inserts dragged item AFTER target when cursor is in lower 50% of target', () => {
    cy.intercept(rootOrderRoute, { items: [], groups: [] }).as('rootOrder')

    // Drag "a" (top item) down onto the lower half of "c" (bottom item)
    dragHandleToHalf('drag-handle-a', 'drag-handle-c', 'lower')

    cy.wait('@rootOrder').its('request.body.order').should(order => {
      expect(order).to.be.an('array').with.length(3)
      // "a" must appear after "c" in the resulting order
      const ids = order.map((e: { id: string }) => e.id)
      expect(ids.indexOf('a')).to.be.greaterThan(ids.indexOf('c'))
    })
  })
})
