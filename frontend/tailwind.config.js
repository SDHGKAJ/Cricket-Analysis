/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cricket: {
          pitch: "#0F172A",
          green: "#10B981",
          emerald: "#059669",
          red: "#EF4444",
          amber: "#F59E0B",
          gold: "#EAB308",
          dark: "#0B0F19",
          card: "#161E2E",
          border: "#1E293B"
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'glow-green': '0 0 20px -3px rgba(16, 185, 129, 0.35)',
        'glow-red': '0 0 20px -3px rgba(239, 68, 68, 0.45)',
        'glow-amber': '0 0 20px -3px rgba(245, 158, 11, 0.35)'
      }
    },
  },
  plugins: [],
}
