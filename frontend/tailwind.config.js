// Opacity modifiers (bg-bad/10) work on CSS-variable colours via color-mix.
const c = (name) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'system-ui', 'sans-serif'],
      },
      /* Colours are CSS variables (see index.css) so they live in one place. */
      colors: {
        bg: c('bg'),
        surface: c('surface'),
        raised: c('raised'),
        line: c('line'),
        'line-strong': c('line-strong'),
        ink: c('ink'),
        body: c('body'),
        mute: c('mute'),
        accent: c('accent'),
        'accent-ink': c('accent-ink'),
        ball: c('ball'),
        good: c('good'),
        warn: c('warn'),
        bad: c('bad'),
        none: c('none'),
      },
      borderRadius: {
        card: '14px',
      },
      animation: {
        'fade-in': 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
