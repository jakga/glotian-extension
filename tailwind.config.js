/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx,html}",
    "./src/side-panel/**/*.{ts,html}",
    "./src/popup/**/*.{ts,html}",
  ],
  theme: {
    extend: {
      colors: {
        // Glotian Design System - matching web app
        glotian: {
          primary: '#87b6c4',
          'primary-dark': '#6B9BAB',
          secondary: '#89b78a',
          'secondary-dark': '#6E9C70',
          bg: {
            light: '#f8f7f4',
            white: '#ffffff',
          },
          text: {
            primary: '#1F2937',
            secondary: '#6B7280',
            tertiary: '#9CA3AF',
          },
          border: '#E5E7EB',
          error: '#DC2626',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'glotian-gradient': 'linear-gradient(135deg, #87b6c4 0%, #89b78a 100%)',
        'glotian-gradient-hover': 'linear-gradient(135deg, #6B9BAB 0%, #6E9C70 100%)',
      },
      borderRadius: {
        'glotian': '12px',
      },
      boxShadow: {
        'glotian': '0 2px 8px rgba(135, 182, 196, 0.08)',
        'glotian-lg': '0 4px 12px rgba(135, 182, 196, 0.3)',
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-out': 'slideOut 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 2s infinite',
      },
      keyframes: {
        slideIn: {
          'from': {
            transform: 'translateX(100%)',
            opacity: '0',
          },
          'to': {
            transform: 'translateX(0)',
            opacity: '1',
          },
        },
        slideOut: {
          'from': {
            transform: 'translateX(0)',
            opacity: '1',
          },
          'to': {
            transform: 'translateX(100%)',
            opacity: '0',
          },
        },
        fadeIn: {
          'from': {
            opacity: '0',
          },
          'to': {
            opacity: '1',
          },
        },
        bounceSubtle: {
          '0%, 100%': {
            transform: 'translateY(0)',
          },
          '50%': {
            transform: 'translateY(-4px)',
          },
        },
      },
    },
  },
  plugins: [],
};
