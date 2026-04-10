/** @type {import('next').NextConfig} */
const isDevServer = process.env.npm_lifecycle_event === 'dev'

const nextConfig = {
  distDir: isDevServer ? '.next-dev' : '.next',
  experimental: {
    serverComponentsExternalPackages: [
      '@prisma/client',
      '@prisma/adapter-better-sqlite3',
      'better-sqlite3',
    ],
    // Ship the bundled SQLite DB inside the serverless function bundle so we
    // can copy it to /tmp on cold start. See src/lib/db.ts for the copy logic.
    outputFileTracingIncludes: {
      '/api/**': ['./prisma/dev.db', './dev.db'],
    },
  },
}

module.exports = nextConfig
