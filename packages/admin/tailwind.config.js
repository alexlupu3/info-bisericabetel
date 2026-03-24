/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{tsx,ts,jsx,js}', './index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Franie-SLight', 'Arial', 'sans-serif'],
        bold:    ['Franie-SBold', 'Arial', 'sans-serif'],
        content: ['Lato', 'system-ui', 'sans-serif'],
      },
    },
  },
}
