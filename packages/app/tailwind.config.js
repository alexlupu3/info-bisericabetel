/** @type {import('tailwindcss').Config} */
export default {
  // render-snapshot.ts: the API's server-rendered HTML snapshot uses the same classes (ADR-022)
  content: ['./src/**/*.{tsx,ts,jsx,js}', './index.html', '../api/src/services/seo/render-snapshot.ts'],
  theme: {
    extend: {
      fontFamily: {
        sans:      ['Franie-SLight', 'Arial', 'sans-serif'],
        bold:      ['Franie-SBold', 'Arial', 'sans-serif'],
        condensed: ['Franie-CondensedXLight-Italic', 'Arial Narrow', 'sans-serif'],
        content:   ['Lato', 'system-ui', 'sans-serif'],
      },
    },
  },
}
