/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#07090d', soft: '#0c1017', card: '#111722', raised: '#161e2b' },
        line: 'rgba(255,255,255,0.07)',
        up: { DEFAULT: '#22d17b', soft: 'rgba(34,209,123,0.14)' },
        down: { DEFAULT: '#ff4d5e', soft: 'rgba(255,77,94,0.14)' },
        gold: { DEFAULT: '#f5c451', soft: 'rgba(245,196,81,0.14)', deep: '#c9952b' },
        ink: { DEFAULT: '#e8edf5', dim: '#9aa6b8', mute: '#5e6a7d' },
        accent: '#7c8cff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 30px rgba(0,0,0,0.35)',
        gold: '0 0 0 1px rgba(245,196,81,0.35), 0 8px 30px rgba(245,196,81,0.15)',
      },
      keyframes: {
        ticker: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      animation: {
        ticker: 'ticker 60s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
