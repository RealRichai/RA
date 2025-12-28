import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // RA Luxury Theme
        primary: { DEFAULT: '#0D9488', 50: '#F0FDFA', 100: '#CCFBF1', 500: '#14B8A6', 600: '#0D9488', 700: '#0F766E' },
        secondary: { DEFAULT: '#D4AF37', 50: '#FEF9E7', 100: '#FDF3C7', 500: '#D4AF37', 600: '#B8962E' },
        accent: { DEFAULT: '#CD7F32', 50: '#FDF4E7', 100: '#FCE7C7', 500: '#CD7F32', 600: '#A66629' },
        charcoal: { DEFAULT: '#1C1C1C', 50: '#F5F5F5', 100: '#E5E5E5', 800: '#262626', 900: '#1C1C1C' },
        cream: { DEFAULT: '#FAF8F5', 50: '#FFFFFF', 100: '#FAF8F5', 200: '#F5F0E8' }
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      spacing: { '18': '4.5rem', '22': '5.5rem', '30': '7.5rem' },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      boxShadow: {
        'luxury': '0 4px 20px -2px rgba(0, 0, 0, 0.1), 0 2px 8px -2px rgba(0, 0, 0, 0.05)',
        'luxury-lg': '0 8px 30px -4px rgba(0, 0, 0, 0.15), 0 4px 12px -4px rgba(0, 0, 0, 0.08)'
      }
    }
  },
  plugins: []
};

export default config;
