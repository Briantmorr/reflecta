import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        journal: {
          bg: '#0f0d0b',
          nav: '#141210',
          pane: '#181512',
          elevated: '#201d19',
          border: '#2a2520',
          'border-subtle': '#201d19',
          text: '#e8e3da',
          secondary: '#9c9189',
          muted: '#5a5450',
          accent: '#c9a96e',
          'accent-hover': '#d4b87a',
          'accent-subtle': 'rgba(201,169,110,0.08)',
          'accent-dim': 'rgba(201,169,110,0.15)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      typography: {
        journal: {
          css: {
            '--tw-prose-body': '#e8e3da',
            '--tw-prose-headings': '#e8e3da',
            '--tw-prose-bold': '#e8e3da',
            '--tw-prose-code': '#c9a96e',
            '--tw-prose-quotes': '#9c9189',
            '--tw-prose-quote-borders': '#c9a96e',
            '--tw-prose-bullets': '#5a5450',
            '--tw-prose-counters': '#5a5450',
          },
        },
      },
    },
  },
  plugins: [typography],
}

export default config
