/**
 * Increment 3 — content type rendering
 */
const base = {
  id: '', state: 'published' as const, sites: [] as string[],
  orderPosition: 0, groupId: null, groupTitle: null,
  expiresAt: null, createdAt: '', updatedAt: '',
}

function mockContent(items: object[]) {
  cy.intercept('GET', '/api/content*', { site: null, items }).as('content')
}

beforeEach(() => {
  cy.intercept('GET', '/api/sites', { sites: [] })
})

describe('Card content type', () => {
  it('renders title, description, date and CTA text; entire card is the link', () => {
    mockContent([{
      ...base, id: 'c1', type: 'card',
      data: {
        title: 'Conferința de Tineret',
        description: 'Un weekend de rugăciune și comuniune.',
        startDate: '2099-04-10',
        endDate: '2099-04-12',
        link: 'https://example.com',
        cta: 'Înregistrează-te',
      },
    }])
    cy.visit('/')
    cy.contains('Conferința de Tineret').should('be.visible')
    cy.contains('Un weekend de rugăciune').should('be.visible')
    // CTA text is visible as a span (not a link), whole card is wrapped in <a>
    cy.contains('Înregistrează-te').should('be.visible')
    cy.get('a[href="https://example.com"] article').should('exist')
  })

  it('whole card is wrapped in an anchor when link is present', () => {
    mockContent([{
      ...base, id: 'c1b', type: 'card',
      data: { title: 'Card cu link', link: 'https://example.com/card' },
    }])
    cy.visit('/')
    cy.get('a[href="https://example.com/card"][target="_blank"] article').should('exist')
  })

  it('renders without a wrapping anchor when no link', () => {
    mockContent([{ ...base, id: 'c2', type: 'card', data: { title: 'Eveniment simplu' } }])
    cy.visit('/')
    cy.contains('Eveniment simplu').should('be.visible')
    cy.get('article').should('exist')
    // No wrapping anchor — article should not be inside an <a>
    cy.get('a article').should('not.exist')
  })
})

describe('Richtext content type', () => {
  it('renders markdown body', () => {
    mockContent([{
      ...base, id: 'r1', type: 'richtext',
      data: { title: 'Anunț', body: '**Important**: Adunarea din această duminică.' },
    }])
    cy.visit('/')
    cy.contains('Anunț').should('be.visible')
    cy.contains('Important').should('be.visible')
  })

  it('renders without title', () => {
    mockContent([{
      ...base, id: 'r2', type: 'richtext',
      data: { body: 'Mesaj fără titlu.' },
    }])
    cy.visit('/')
    cy.contains('Mesaj fără titlu.').should('be.visible')
  })
})

describe('Poster content type', () => {
  it('renders image', () => {
    mockContent([{
      ...base, id: 'p1', type: 'poster',
      data: { image: '/icons/icon-192.png', alt: 'Poster test' },
    }])
    cy.visit('/')
    cy.get('img[alt="Poster test"]').should('exist')
  })

  it('wraps entire article in a link when link is provided', () => {
    mockContent([{
      ...base, id: 'p2', type: 'poster',
      data: { imageUrl: '/icons/icon-192.png', link: 'https://example.com' },
    }])
    cy.visit('/')
    cy.get('a[href="https://example.com"][target="_blank"] article').should('exist')
  })

  it('renders without a wrapping anchor when no link', () => {
    mockContent([{
      ...base, id: 'p3', type: 'poster',
      data: { imageUrl: '/icons/icon-192.png', alt: 'No link poster' },
    }])
    cy.visit('/')
    cy.get('img[alt="No link poster"]').should('exist')
    cy.get('a article').should('not.exist')
  })
})

describe('Video content type', () => {
  it('renders youtube iframe', () => {
    mockContent([{
      ...base, id: 'v1', type: 'video',
      data: { youtubeId: 'dQw4w9WgXcQ', title: 'Predică' },
    }])
    cy.visit('/')
    cy.contains('Predică').should('be.visible')
    cy.get('iframe[src*="dQw4w9WgXcQ"]').should('exist')
  })

  it('accepts full YouTube URLs', () => {
    mockContent([{
      ...base, id: 'v2', type: 'video',
      data: { youtubeId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    }])
    cy.visit('/')
    cy.get('iframe[src*="dQw4w9WgXcQ"]').should('exist')
  })

  it('renders when url field is used (admin format)', () => {
    mockContent([{
      ...base, id: 'v3', type: 'video',
      data: { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Predică admin' },
    }])
    cy.visit('/')
    cy.contains('Predică admin').should('be.visible')
    cy.get('iframe[src*="dQw4w9WgXcQ"]').should('exist')
  })

  it('renders nothing instead of crashing when url is missing', () => {
    mockContent([{
      ...base, id: 'v4', type: 'video',
      data: { title: 'Fără URL' },
    }])
    cy.visit('/')
    cy.get('[data-testid="content-list"]').should('exist')
  })
})

describe('Date fields on non-card content types', () => {
  it('renders richtext with startDate without crashing', () => {
    mockContent([{
      ...base, id: 'rd1', type: 'richtext',
      data: { body: 'Anunț cu dată', startDate: '2099-06-01', endDate: '2099-06-15' },
    }])
    cy.visit('/')
    cy.contains('Anunț cu dată').should('be.visible')
  })

  it('renders poster with startDate without crashing', () => {
    mockContent([{
      ...base, id: 'pd1', type: 'poster',
      data: { imageUrl: '/icons/icon-192.png', startDate: '2099-07-01' },
    }])
    cy.visit('/')
    cy.get('img').should('exist')
  })

  it('renders video with startDate without crashing', () => {
    mockContent([{
      ...base, id: 'vd1', type: 'video',
      data: { url: 'https://youtu.be/dQw4w9WgXcQ', startDate: '2099-08-01' },
    }])
    cy.visit('/')
    cy.get('iframe[src*="dQw4w9WgXcQ"]').should('exist')
  })
})

describe('Group block', () => {
  it('groups items under a shared heading', () => {
    const groupId = 'g1'
    mockContent([
      { ...base, id: 'gi1', type: 'card', groupId, groupTitle: 'Evenimente speciale',
        data: { title: 'Slujbă de dimineață' } },
      { ...base, id: 'gi2', type: 'card', groupId, groupTitle: 'Evenimente speciale',
        data: { title: 'Slujbă de seară' } },
    ])
    cy.visit('/')
    cy.contains('Evenimente speciale').should('be.visible')
    cy.contains('Slujbă de dimineață').should('be.visible')
    cy.contains('Slujbă de seară').should('be.visible')
  })
})

export {}
