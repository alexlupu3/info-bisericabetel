import { execFileSync } from 'child_process'
import * as path from 'path'
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    screenshotOnRunFailure: true,
    video: false,
    setupNodeEvents(on, config) {
      on('task', {
        // Server-side HTML snapshot (ADR-022) of fixture data, rendered by the API's own
        // renderer without a database — for cypress/e2e/snapshot-parity.cy.ts.
        renderSnapshot(input: unknown): string {
          const apiDir = path.join(config.projectRoot, 'packages', 'api')
          return execFileSync(
            path.join(apiDir, 'node_modules', '.bin', 'tsx'),
            [path.join(apiDir, 'src', 'scripts', 'render-snapshot.ts')],
            { cwd: apiDir, input: JSON.stringify(input), encoding: 'utf8' },
          )
        },
      })
      return config
    },
  },
})
