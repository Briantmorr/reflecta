import 'next-auth'

declare module 'next-auth' {
  /**
   * Extend the default Session.user with the database id that the
   * session() callback in src/lib/auth.ts attaches.
   */
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}
