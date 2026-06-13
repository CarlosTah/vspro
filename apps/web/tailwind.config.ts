import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ─── PALETA CROMÁTICA VSPRO ───────────────────────────────
      colors: {
        background: '#0B0A12',       // Obsidian Purple
        primary: {
          DEFAULT: '#630BF1',        // Electric Indigo
          hover: '#7C3AED',
          muted: '#630BF133',
        },
        accent: {
          DEFAULT: '#8B5CF6',        // Cyber Violet
          hover: '#A78BFA',
          muted: '#8B5CF620',
          glow: '#8B5CF640',
        },
        card: {
          DEFAULT: '#161522',        // Muted Slate
          hover: '#1E1D2E',
          border: '#8B5CF630',       // Cyber Violet 20-30% opacity
        },
        surface: {
          DEFAULT: '#0F0E1A',
          elevated: '#1A1930',
        },
        muted: {
          DEFAULT: '#6B7280',
          foreground: '#9CA3AF',
        },
        success: '#10B981',
        warning: '#F59E0B',
        destructive: '#EF4444',
      },

      // ─── TIPOGRAFÍA ───────────────────────────────────────────
      fontFamily: {
        heading: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display': ['3rem', { lineHeight: '1.1', fontWeight: '700' }],
        'h1': ['2.25rem', { lineHeight: '1.2', fontWeight: '700' }],
        'h2': ['1.875rem', { lineHeight: '1.25', fontWeight: '700' }],
        'h3': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'h4': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'subtitle': ['1.125rem', { lineHeight: '1.5', fontWeight: '500' }],
        'body': ['0.875rem', { lineHeight: '1.6', fontWeight: '400' }],
        'metric': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'caption': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
      },

      // ─── BORDES Y RADIOS ──────────────────────────────────────
      borderRadius: {
        'card': '16px',
        'button': '12px',
        'input': '10px',
        'badge': '8px',
      },

      // ─── SOMBRAS Y GLOWS ─────────────────────────────────────
      boxShadow: {
        'card': '0 4px 24px rgba(99, 11, 241, 0.06)',
        'card-hover': '0 8px 32px rgba(99, 11, 241, 0.12)',
        'glow-sm': '0 0 20px rgba(139, 92, 246, 0.15)',
        'glow-md': '0 0 40px rgba(139, 92, 246, 0.2)',
        'glow-lg': '0 0 80px rgba(139, 92, 246, 0.25)',
      },

      // ─── BACKDROP BLUR ────────────────────────────────────────
      backdropBlur: {
        'glass': '16px',
        'glass-lg': '24px',
      },

      // ─── ANIMACIONES ──────────────────────────────────────────
      animation: {
        'glow-pulse': 'glow-pulse 4s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      // ─── BACKGROUND IMAGES (GRIDS) ───────────────────────────
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
};

export default config;
