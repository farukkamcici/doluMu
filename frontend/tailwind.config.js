/** @type {import('tailwindcss').Config} */

// Design tokens are CSS variables (see src/app/globals.css) so light/dark share one class set.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: token('bg'), subtle: token('bg-subtle') },
        card: { DEFAULT: token('card'), hover: token('card-hover') },
        line: token('border'),
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },
        brand: {
          DEFAULT: token('brand'),
          fg: token('brand-fg'),
          soft: token('brand-soft'),
        },
        level: {
          quiet: token('level-quiet'),
          normal: token('level-normal'),
          busy: token('level-busy'),
          peak: token('level-peak'),
          closed: token('level-closed'),
        },
        mode: {
          bus: token('mode-bus'),
          metrobus: token('mode-metrobus'),
          rail: token('mode-rail'),
          ferry: token('mode-ferry'),
        },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        danger: token('danger'),

        // Legacy dark palette, still used by the admin panel.
        background: '#0f172a',
        surface: '#1E293B',
        primary: '#188580',
        secondary: '#cce8e6',
        text: '#F8FAFC',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 12px 32px -8px rgb(15 23 42 / 0.25), 0 4px 12px -4px rgb(15 23 42 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.98)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'sheet-up': 'sheet-up 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'pop-in': 'pop-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
