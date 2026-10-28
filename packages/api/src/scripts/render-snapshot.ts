// Renders the server-side HTML snapshot (ADR-022) of a page from fixture JSON on stdin and
// prints it to stdout. No database: used by cypress/e2e/snapshot-parity.cy.ts (via a
// Cypress task) to compare the snapshot with what the SPA renders for the same data.
//
//   echo '{"kind":"hub","path":"/","sites":[],"languages":[],"items":[]}' | tsx src/scripts/render-snapshot.ts

import { readFileSync } from 'fs'
import { readSeoConfig } from '../services/seo/organization.js'
import { buildPageModel, type PageModelInput } from '../services/seo/page-model.js'
import { renderSnapshot } from '../services/seo/render-snapshot.js'

const input = JSON.parse(readFileSync(0, 'utf8')) as Omit<PageModelInput, 'baseUrl' | 'config'>
const model = buildPageModel({ ...input, baseUrl: 'http://localhost', config: readSeoConfig({}) })
process.stdout.write(renderSnapshot(model))
