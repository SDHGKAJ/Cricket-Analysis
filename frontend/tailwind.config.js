/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // Design token aliases (match CSS variables)
        surface: {
          base:     '#070C16',
          panel:    '#0D1526',
          card:     '#111B2E',
          elevated: '#172135',
        },
        accent: {
          DEFAULT: '#10B981',
          dim:     'rgba(16,185,129,0.18)',
          glow:    'rgba(16,185,129,0.28)',
        },
        semantic: {
          green:  '#10B981',
          amber:  '#F59E0B',
          red:    '#EF4444',
          sky:    '#38BDF8',
        },
      },
      boxShadow: {
        'glow-green': '0 0 24px -4px rgba(16, 185, 129, 0.30)',
        'glow-red':   '0 0 24px -4px rgba(239, 68, 68, 0.35)',
        'glow-amber': '0 0 24px -4px rgba(245, 158, 11, 0.30)',
        'card':       '0 16px 40px -12px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      borderRadius: {
        'r-sm':  '8px',
        'r-md':  '12px',
        'r-lg':  '16px',
        'r-xl':  '20px',
        'r-2xl': '24px',
      },
      animation: {
        'ring-fill':  'ringFill 1.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'bar-grow':   'barGrow 0.9s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in':    'fadeSlideUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'flaw-pulse': 'flawPulse 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};
