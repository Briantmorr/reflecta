import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
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
  if (isBuildTime()) return undefined // keep build + seed on prisma/dev.db

  const runtimeDb = '/tmp/dev.db'
  const seedDb = path.join(process.cwd(), 'prisma', 'dev.db')

  if (!fs.existsSync(runtimeDb) && fs.existsSync(seedDb)) {
    fs.copyFileSync(seedDb, runtimeDb)
  }
  return `file:${runtimeDb}`
}

function isBuildTime(): boolean {
  const lifecycle = process.env.npm_lifecycle_event
  return lifecycle === 'build' || lifecycle === 'vercel-build'
}

const databaseUrl = resolveDatabaseUrl()
const adapter = new PrismaBetterSqlite3(
  { url: databaseUrl ?? process.env.DATABASE_URL ?? 'file:./dev.db' },
  { timestampFormat: 'unixepoch-ms' }
)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
