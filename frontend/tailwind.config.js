/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        'tinno-green': {
          700: '#445faaff',
          600: '#437ea0ff',
          100: '#e8e8f5ff',
          50: '#e9f2f8ff',
        },
        'tinno-gray': {
          200: '#F5F5F5',
          500: '#B0BEC5',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}