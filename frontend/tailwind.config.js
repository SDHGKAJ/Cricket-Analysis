/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /* ── One font family: Inter ── */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      /* ── Type scale ── */
      fontSize: {
        'xs':   ['12px', { lineHeight: '16px' }],
        'sm':   ['13px', { lineHeight: '18px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'md':   ['16px', { lineHeight: '24px' }],
        'lg':   ['20px', { lineHeight: '28px' }],
        'xl':   ['24px', { lineHeight: '32px' }],
        '2xl':  ['32px', { lineHeight: '40px' }],
        '3xl':  ['40px', { lineHeight: '48px' }],
        '4xl':  ['48px', { lineHeight: '56px' }],
      },

      /* ── Token colors (mirrored in index.css) ── */
      colors: {
        shell: {
          bg: '#2B2F3A',
          panel: '#323744',
        },
        line: {
          DEFAULT: '#444A5B',
          strong: '#555E72',
        },
        text: {
          hi: '#FFFFFF',
          DEFAULT: '#AAB0BD',
          mute: '#6E7486',
        },
        /* Vivid tile colors (flat + soft gradient) — used only as tile fills */
        tile: {
          coral:   '#F4533F',
          periwinkle: '#7B7FE0',
          cyan:    '#1FB5D6',
          amber:   '#F5A623',
          pink:    '#E9588F',
          green:   '#2ECC71',
        },
        /* Fixed status colors — small badges only, never tile color */
        status: {
          good:    '#2ECC71',
          goodbg:  'rgba(46,204,113,0.15)',
          goodln:  'rgba(46,204,113,0.45)',
          medium:  '#F5A623',
          mediumbg:'rgba(245,166,35,0.15)',
          mediumln:'rgba(245,166,35,0.45)',
          bad:     '#F4533F',
          badbg:   'rgba(244,83,63,0.15)',
          badln:   'rgba(244,83,63,0.45)',
          none:    '#AAB0BD',
          nonebg:  'rgba(170,176,189,0.15)',
          noneln:  'rgba(170,176,189,0.45)',
        },
      },

      /* ── 8px spacing grid ── */
      spacing: {
        '18': '72px',
      },

      /* ── Radius ── */
      borderRadius: {
        'tile': '16px',
        'panel': '12px',
        'badge': '999px',
      },

      /* ── Soft shadows ── */
      boxShadow: {
        'tile': '0 8px 24px -8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        'panel': '0 4px 16px -6px rgba(0,0,0,0.5)',
      },

      /* ── Animations ── */
      animation: {
        'fade-in': 'fadeSlideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeSlideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};
