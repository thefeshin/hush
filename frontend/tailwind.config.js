/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#1a1a2e',
        'bg-secondary': '#16213e',
        'bg-tertiary': '#0f3460',
        'text-primary': '#eaeaea',
        'text-secondary': '#a0a0a0',
        accent: '#e94560',
        'accent-hover': '#ff6b6b',
        success: '#4ade80',
        error: '#ef4444',
        border: '#2a2a4a',
        warning: '#f59e0b',
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
