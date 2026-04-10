import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export async function GET() {
  const cwd = process.cwd()
  const checks = {
    cwd,
    env: {
      VERCEL: process.env.VERCEL ?? 'not set',
      NODE_ENV: process.env.NODE_ENV ?? 'not set',
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'not set',
    },
    files: {
      'prisma/dev.db': fs.existsSync(path.join(cwd, 'prisma', 'dev.db')),
      'dev.db': fs.existsSync(path.join(cwd, 'dev.db')),
      '/tmp/dev.db': fs.existsSync('/tmp/dev.db'),
      'prisma/': fs.existsSync(path.join(cwd, 'prisma')),
    },
    sizes: {} as Record<string, number>,
    prismaDir: [] as string[],
  }

  // Check sizes for existing files
  for (const [key, exists] of Object.entries(checks.files)) {
    if (exists) {
      const fullPath = key.startsWith('/') ? key : path.join(cwd, key)
      try {
        checks.sizes[key] = fs.statSync(fullPath).size
      } catch { /* skip */ }
    }
  }

  // List prisma directory if it exists
  if (checks.files['prisma/']) {
    try {
      checks.prismaDir = fs.readdirSync(path.join(cwd, 'prisma'))
    } catch { /* skip */ }
  }

  return NextResponse.json(checks)
}
