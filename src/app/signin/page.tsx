import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { auth, signIn, AUTH_ENABLED } from '@/lib/auth'

export const metadata = {
  title: 'Sign in — Mirror',
}

export default async function SignInPage() {
  // Feature flag off → sign-in page is meaningless, bounce home.
  if (!AUTH_ENABLED) redirect('/')

  const session = await auth()
  if (session?.user) redirect('/')

  const hasGoogle =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET

  return (
    <main
      className="flex items-center justify-center min-h-screen px-4"
      style={{ background: 'var(--mirror-bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8 flex flex-col items-center gap-6"
        style={{
          background: 'var(--mirror-pane)',
          border: '1px solid var(--mirror-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={18} style={{ color: 'var(--mirror-accent)' }} />
          <span
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: 'var(--mirror-text)' }}
          >
            Mirror
          </span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <h1
            className="text-lg font-medium text-center"
            style={{ color: 'var(--mirror-text)' }}
          >
            Sign in to continue
          </h1>
          <p
            className="text-xs text-center"
            style={{ color: 'var(--mirror-muted)' }}
          >
            A guided tour of the psyche awaits.
          </p>
        </div>

        {hasGoogle ? (
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
            className="w-full"
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors text-sm font-medium"
              style={{
                background: 'var(--mirror-accent)',
                color: '#0f0d0b',
              }}
            >
              Continue with Google
            </button>
          </form>
        ) : (
          <p
            className="text-xs text-center leading-relaxed"
            style={{ color: 'var(--mirror-muted)' }}
          >
            Google OAuth isn&apos;t configured yet. Set{' '}
            <code
              style={{
                color: 'var(--mirror-accent)',
                background: 'var(--mirror-elevated)',
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              GOOGLE_CLIENT_ID
            </code>{' '}
            and{' '}
            <code
              style={{
                color: 'var(--mirror-accent)',
                background: 'var(--mirror-elevated)',
                padding: '1px 4px',
                borderRadius: 3,
              }}
            >
              GOOGLE_CLIENT_SECRET
            </code>{' '}
            in your environment, then restart.
          </p>
        )}
      </div>
    </main>
  )
}
