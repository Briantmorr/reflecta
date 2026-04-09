import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'

/**
 * On Vercel, the filesystem is read-only except for /tmp. At build time we
 * seed a SQLite file at prisma/dev.db and include it in the function bundle
 * via outputFileTracingIncludes (see next.config.js). On cold start we copy
 * that seed file to /tmp/dev.db so the app has a populated graph, and point
 * Prisma at the writable copy.
 *
 * Every cold start reseeds — which is exactly what we want for a throwaway
 * preview environment. When we move to Postgres this can all go away.
 */
function resolveDatabaseUrl(): string | undefined {
  if (!process.env.VERCEL) return undefined // use env DATABASE_URL as-is

  const runtimeDb = '/tmp/dev.db'
  const seedDb = path.join(process.cwd(), 'prisma', 'dev.db')

  if (!fs.existsSync(runtimeDb) && fs.existsSync(seedDb)) {
    fs.copyFileSync(seedDb, runtimeDb)
  }
  return `file:${runtimeDb}`
}

const databaseUrl = resolveDatabaseUrl()

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
