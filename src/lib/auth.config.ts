import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Edge-safe auth config used by middleware.
 * Does NOT import the Prisma adapter (Prisma can't run on the edge).
 *
 * Feature flag: AUTH_ENABLED — when false, the app is wide-open just
 * like it has been during local dev. Set AUTH_ENABLED=true to turn on
 * Google OAuth and gate the whole app behind sign-in.
 */
export const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true'

const googleConfigured =
  AUTH_ENABLED &&
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET

export const authConfig = {
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    authorized({ request, auth }) {
      // Feature flag OFF → everything is public, no gating.
      if (!AUTH_ENABLED) return true

      const { nextUrl } = request
      const isLoggedIn = !!auth?.user
      const isOnSignin = nextUrl.pathname.startsWith('/signin')

      if (isOnSignin) {
        // Already signed in? Bounce back to the app.
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl))
        return true
      }
      return isLoggedIn
    },
  },
} satisfies NextAuthConfig
