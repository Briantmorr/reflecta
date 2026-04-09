import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * Root middleware. Delegates to NextAuth's edge-safe authorized() callback.
 * When AUTH_ENABLED=false that callback always returns true, so the app
 * stays wide-open. When AUTH_ENABLED=true unauthenticated users get
 * redirected to /signin.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Skip Next internals, the NextAuth API route, and static files.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
