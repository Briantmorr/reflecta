/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ship the seeded SQLite DB inside the serverless function bundle so we
    // can copy it to /tmp on cold start. See src/lib/db.ts for the copy logic.
    outputFileTracingIncludes: {
      '/**/*': ['./prisma/dev.db', './dev.db'],
    },
  },
}

module.exports = nextConfig
