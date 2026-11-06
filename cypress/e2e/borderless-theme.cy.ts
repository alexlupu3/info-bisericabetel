const item = {
  id: 'surface-card', type: 'card', state: 'published', sites: [],
  orderPosition: 0, groupId: null, expiresAt: null,
  data: { title: 'Surface card' }, createdAt: '', updatedAt: '',
}

function visitTheme(path: string, theme: 'light' | 'dark') {
  cy.intercept('GET', '/api/sites', { sites: [] })
  cy.intercept('GET', '/api/content*', { site: null, items: [item] })
  cy.intercept('GET', '/api/languages', { languages: [{ code: 'ro', name: 'Română', isDefault: true, enabled: true }] })
  cy.intercept('GET', '/api/translations*', { locale: 'ro', translations: {} })
  cy.intercept('GET', '/api/auth/me', { id: 'u1', email: 'admin@betel.ro', role: 'admin', mustChangePassword: false })
  cy.intercept('GET', '/api/admin/content', { items: [item] })
  cy.intercept('GET', '/api/admin/groups', { groups: [] })
  cy.intercept('GET', '/api/admin/languages', { languages: [] })
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.setItem('theme', theme)
      win.localStorage.setItem('betel-admin-token', 'mock-token')
    },
  })
  cy.get('html').should('have.attr', 'data-theme', theme)
}

function checkSurface(selector: string, theme: 'light' | 'dark', token = '--surface') {
  cy.get(selector).should('be.visible').should($el => {
    const style = getComputedStyle($el[0])
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      expect(style.getPropertyValue(`border-${side.toLowerCase()}-width`)).to.eq('0px')
    }
    expect(style.borderRadius).to.eq('0px')
    expect(style.getPropertyValue('--surface').trim()).to.eq(theme === 'light' ? '#ffffff' : '#1f1f23')
    const probe = $el[0].ownerDocument.createElement('span')
    probe.style.backgroundColor = `var(${token})`
    $el[0].appendChild(probe)
    expect(style.backgroundColor).to.eq(getComputedStyle(probe).backgroundColor)
    probe.remove()
    expect(style.boxShadow).not.to.eq('none')
    expect(style.getPropertyValue('--border')).to.eq('')
  })
}

describe('Borderless surfaces', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`uses a borderless public card and raised menu in ${theme}`, () => {
      visitTheme('/', theme)
      checkSurface('[data-item-id="surface-card"]', theme)
      cy.get('[data-testid="site-switcher-trigger"]').click()
      checkSurface('[role="listbox"]', theme, '--surface-3')
    })

    it(`uses a borderless admin card, dialog and focused field in ${theme}`, () => {
      visitTheme('/admin/', theme)
      checkSurface('[data-testid="content-row-surface-card"]', theme)
      cy.get('[data-testid="create-content-btn"]').click()
      checkSurface('[data-dialog-panel]', theme, '--surface-3')
      cy.get('[data-testid="create-title-input"]').focus().should($input => {
        const style = getComputedStyle($input[0])
        expect(style.borderWidth).to.eq('0px')
        expect(style.outlineWidth).to.eq('2px')
        expect(style.outlineStyle).to.eq('solid')
        expect(style.outlineOffset).to.eq('2px')
        expect(style.boxShadow).to.contain('0px -2px 0px')
        expect(style.backgroundColor).to.eq(theme === 'light' ? 'rgb(238, 238, 241)' : 'rgb(21, 21, 24)')
      })
    })
  }
})

describe('Borderless theme — touch screens', () => {
  it('regression: surface hover styles only apply where hover is supported', () => {
    cy.intercept('GET', '/api/sites', { sites: [] })
    cy.intercept('GET', '/api/content*', { site: null, items: [] })
    cy.visit('/')
    cy.document().then(doc => {
      const unguarded: string[] = []
      for (const sheet of Array.from(doc.styleSheets)) {
        let rules: CSSRuleList
        try { rules = sheet.cssRules } catch { continue }
        for (const rule of Array.from(rules)) {
          // Top-level rules only: rules inside @media (hover: hover) are nested and skipped.
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(':hover') && /background|box-shadow/.test(rule.style.cssText)) {
            unguarded.push(rule.selectorText)
          }
        }
      }
      expect(unguarded.filter(sel => /theme-|betel-hand-button|surface/.test(sel) || sel.includes('--surface')), 'unguarded surface hover rules').to.deep.equal([])
    })
  })
})

export {}
