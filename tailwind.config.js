/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Extra-large breakpoints so the layout has room to breathe on the
    // kitchen-wall touchscreen and a 27" desktop monitor. Tailwind's `2xl`
    // default is 1536px; we add a 1920 and 2400 break so cards/text scale up.
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
      '4xl': '2400px',
    },
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
        'paper-lg': '8px 8px 0 0 rgba(16,24,43,0.9)',
        'paper-xl': '12px 12px 0 0 rgba(16,24,43,0.9)',
        soft: '0 1px 0 rgba(16,24,43,0.06), 0 2px 6px rgba(16,24,43,0.08)',
        // Inner top highlight used on raised pill buttons.
        'inset-hi': 'inset 0 1px 0 rgba(255,255,255,0.12)',
      },
      borderRadius: {
        chunky: '22px',
        'chunky-lg': '28px',
      },
      fontSize: {
        // Fluid headline scales so the family TV shows giant numbers and a
        // phone shows readable ones — without dozens of breakpoints.
        'fluid-hero': ['clamp(2.5rem, 7.5vw, 7.5rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'fluid-money': ['clamp(3rem, 8.5vw, 9rem)', { lineHeight: '0.9', letterSpacing: '-0.025em' }],
        'fluid-title': ['clamp(1.5rem, 2.6vw, 2.75rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'fluid-section': ['clamp(1.125rem, 1.4vw, 1.5rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        // Ambient TV: huge, room-readable.
        'fluid-ambient': ['clamp(4.5rem, 16vw, 20rem)', { lineHeight: '0.85', letterSpacing: '-0.04em' }],
        'fluid-ambient-sm': ['clamp(2rem, 4vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
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
        pop: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '60%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Soft breathing aura behind a tier portrait. Tier colour is fed
        // through a CSS variable (`--tier-glow`) so a single keyframe
        // animates every tier with its own hue. Used on Hero portrait.
        tierGlow: {
          '0%, 100%': {
            opacity: '0.55',
            transform: 'scale(0.96)',
          },
          '50%': {
            opacity: '1',
            transform: 'scale(1.06)',
          },
        },
        // One-shot celebration burst when a member levels up. The
        // overlay scales in, flashes the tier ring, then settles.
        levelUpBurst: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '40%': { transform: 'scale(1.08)', opacity: '1' },
          '70%': { transform: 'scale(0.98)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Sun-ray spokes rotating behind a level-up portrait.
        rayRotate: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        // Subtle idle breathing for the hero portrait itself so a
        // static PNG doesn't feel dead on the page.
        portraitBreath: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        pulseRed: 'pulseRed 1.4s ease-out infinite',
        floatIn: 'floatIn 220ms ease-out',
        confettiFall: 'confettiFall 2.4s ease-in forwards',
        crownBob: 'crownBob 2.6s ease-in-out infinite',
        pop: 'pop 280ms cubic-bezier(.18,.89,.32,1.28)',
        shimmer: 'shimmer 1.6s linear infinite',
        tierGlow: 'tierGlow 3.6s ease-in-out infinite',
        levelUpBurst: 'levelUpBurst 700ms cubic-bezier(.18,.89,.32,1.28)',
        rayRotate: 'rayRotate 18s linear infinite',
        portraitBreath: 'portraitBreath 5.5s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', '"Inter Display"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
