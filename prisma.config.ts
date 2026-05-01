import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Local Prisma CLI commands should prefer .env.local so development writes
// cannot accidentally target the shared production database copied into
// .env.production. Existing process env values still win in Vercel/CI.
if (existsSync('.env.local')) {
  loadEnv({ path: '.env.local' })
}
loadEnv()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
