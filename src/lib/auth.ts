import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { authConfig, AUTH_ENABLED } from '@/lib/auth.config'

/**
 * Full auth instance — includes the Prisma adapter so sessions + accounts
 * persist to SQLite. Imported by API routes and server components that
 * need `auth()` to read the current session.
 *
 * DO NOT import this from middleware.ts — middleware runs on the edge
 * runtime which can't load the Prisma client. Use auth.config.ts there.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, user }) {
      // With the database strategy, `user` is the DB user row.
      // Expose its id on session.user so API routes can scope by owner.
      if (session.user && user) {
        session.user.id = user.id
      }
      return session
    },
  },
})

export { AUTH_ENABLED }

/**
 * Small helper: returns the current user id, or null when:
 *  - auth is disabled (feature flag off)
 *  - no active session
 *
 * API routes use this to decide whether to scope queries by owner.
 */
export async function currentUserId(): Promise<string | null> {
  if (!AUTH_ENABLED) return null
  const session = await auth()
  return session?.user?.id ?? null
}
