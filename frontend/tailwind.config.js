/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0E13',
        surface: '#12161D',
        raised: '#181D26',
        line: '#252C38',
        ink: '#ECE9E2',
        muted: '#8A93A3',
        amber: '#FFB224',
        mint: '#38D9A0',
        coral: '#FF6B5B',
        sky: '#6CB6FF',
      },
      fontFamily: {
        sans: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
