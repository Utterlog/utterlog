/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Plan A — matches admin SPA & installer
        brand: {
          DEFAULT: '#0052D9',
          hover: '#003DA6',
          soft: '#E6EEFB',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        // Plan A enforces square corners everywhere
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        full: '9999px', // keep for pill badges where explicitly desired
      },
    },
  },
  plugins: [],
};
