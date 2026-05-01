import type { Metadata } from 'next'
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google'
import { SettingsProvider } from '@/lib/settings'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Mirror — A Guided Tour of the Psyche',
  description: 'Reflective conversation with a living map of your inner world',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const raw = localStorage.getItem('mirror:settings')
                  const parsed = raw ? JSON.parse(raw) : null
                  const theme = parsed?.theme === 'dark' ? 'dark' : 'light'
                  document.documentElement.dataset.theme = theme
                } catch {
                  document.documentElement.dataset.theme = 'light'
                }
              })()
            `,
          }}
        />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  )
}
