/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm paper palette pulled from the style guide.
        cream: {
          50: '#FBF6E6',
          100: '#F6EED5',
          200: '#F0E5C0',
          300: '#E6D8A4',
        },
        paper: '#FBFAF4',
        // Deep ink for borders, chrome, and dark "Available" column.
        ink: {
          900: '#10182B',
          800: '#1A2238',
          700: '#2A3350',
          500: '#5B6072',
          400: '#7A7F8E',
          300: '#A6A9B5',
        },
        money: {
          DEFAULT: '#0F6E37',
          dim: '#3F8A57',
        },
        // Member accents (saturated, friendly).
        accent: {
          blue: '#3253D7',
          red: '#DB4646',
          yellow: '#E8B12A',
          green: '#3CA163',
          orange: '#E07E2E',
          purple: '#8B5BD9',
          teal: '#22A8A8',
          pink: '#E25CA6',
        },
      },
      boxShadow: {
        // The "lifted card" look from the guide: thin dark border with a slight
        // offset shadow underneath so cards feel like they're sitting on paper.
        paper: '4px 4px 0 0 rgba(16,24,43,0.9)',
        'paper-sm': '2px 2px 0 0 rgba(16,24,43,0.9)',
        soft: '0 1px 0 rgba(16,24,43,0.06), 0 2px 6px rgba(16,24,43,0.08)',
      },
      borderRadius: {
        chunky: '22px',
      },
      keyframes: {
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(219,70,70,0.65)' },
          '50%': { boxShadow: '0 0 0 8px rgba(219,70,70,0)' },
        },
        floatIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        confettiFall: {
          '0%': { transform: 'translate(0,0) rotate(0deg)', opacity: '1' },
          '100%': {
            transform: 'translate(var(--cx), 110vh) rotate(720deg)',
            opacity: '0',
          },
        },
        crownBob: {
          '0%, 100%': { transform: 'translateY(0) rotate(-6deg)' },
          '50%': { transform: 'translateY(-3px) rotate(6deg)' },
        },
      },
      animation: {
        pulseRed: 'pulseRed 1.4s ease-out infinite',
        floatIn: 'floatIn 220ms ease-out',
        confettiFall: 'confettiFall 2.4s ease-in forwards',
        crownBob: 'crownBob 2.6s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', '"Inter Display"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
