/**
 * Seed Postgres-backed prompt versions from local prompts/*.json files.
 *
 * Run with: npm run prompts:seed
 */
import { loadEnvConfig } from '@next/env'
import fs from 'node:fs'
import path from 'node:path'

loadEnvConfig(process.cwd())

type PromptFile = { prompt?: unknown }

function readPromptFile(filename: string) {
  const filePath = path.join(process.cwd(), 'prompts', filename)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing prompt file: prompts/${filename}`)
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PromptFile
  if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) {
    throw new Error(`Prompt file must contain a non-empty "prompt" string: prompts/${filename}`)
  }

  return parsed.prompt
}

async function main() {
  const [{ prisma }, { PROMPT_DEFINITIONS }] = await Promise.all([
    import('../src/lib/db'),
    import('../src/lib/promptStore'),
  ])

  console.log('🌱 Seeding prompt versions from prompts/*.json')

  for (const definition of PROMPT_DEFINITIONS) {
    const content = readPromptFile(definition.filename)
    await prisma.promptConfig.upsert({
      where: { key: definition.key },
      create: { key: definition.key },
      update: {},
    })

    const existing = await prisma.promptVersion.findFirst({
      where: { key: definition.key, content },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const seedLabel = `Seeded from prompts/${definition.filename}`

    const version = existing
      ? await prisma.promptVersion.update({
          where: { id: existing.id },
          data: {
            label: seedLabel,
          },
        })
      : await prisma.promptVersion.create({
          data: {
            key: definition.key,
            content,
            label: seedLabel,
            createdBy: 'prompt-seed',
            createdAt: now,
          },
        })

    await prisma.promptConfig.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        activeVersionId: version.id,
        updatedAt: now,
        updatedBy: 'prompt-seed',
      },
      update: {
        activeVersionId: version.id,
        updatedAt: now,
        updatedBy: 'prompt-seed',
      },
    })

    console.log(
      `  ✓ ${definition.key} -> prompts/${definition.filename} (${existing ? 'activated existing' : 'created'})`
    )
  }

  console.log('✨ Prompt seed complete')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/db')
    await prisma.$disconnect()
  })
