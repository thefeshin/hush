/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#09090b',
        'bg-secondary': '#111113',
        'bg-tertiary': '#18181b',
        'text-primary': '#f4f4f5',
        'text-secondary': '#a1a1aa',
        accent: '#d4d4d8',
        'accent-hover': '#fafafa',
        success: '#d4d4d8',
        error: '#a1a1aa',
        border: '#27272a',
        warning: '#c4c4c8',
      },
      fontSize: {
        display: ['2.25rem', { lineHeight: '1.1' }],
        h1: ['1.5rem', { lineHeight: '1.25' }],
        h2: ['1.125rem', { lineHeight: '1.35' }],
        body: ['0.9375rem', { lineHeight: '1.5' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.45' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
        button: ['0.875rem', { lineHeight: '1.25' }],
      },
      animation: {
        spin: 'spin 1s linear infinite',
        blink: 'blink 1s infinite',
        pulse: 'pulse 1s infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
      boxShadow: {
        card: '0 4px 20px rgba(0, 0, 0, 0.3)',
        toast: '0 4px 12px rgba(0, 0, 0, 0.3)',
        pin: '0 8px 20px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
}
