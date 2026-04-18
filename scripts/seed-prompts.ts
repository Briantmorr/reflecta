/**
 * Seed Firestore prompt versions from the local prompts/*.json files.
 *
 * Run with: npm run prompts:seed
 */
import { loadEnvConfig } from '@next/env'
import fs from 'node:fs'
import path from 'node:path'
import { getFirebaseAdminDb } from '../src/lib/firebaseAdmin'
import { PROMPT_DEFINITIONS, PromptVersion } from '../src/lib/promptStore'

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
  const db = getFirebaseAdminDb()
  if (!db) {
    throw new Error(
      'Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    )
  }

  console.log('🌱 Seeding Firestore prompts from prompts/*.json')

  for (const definition of PROMPT_DEFINITIONS) {
    const content = readPromptFile(definition.filename)
    const configRef = db.collection('promptConfigs').doc(definition.key)
    const versionsRef = configRef.collection('versions')
    const existingSnapshot = await versionsRef.orderBy('createdAt', 'desc').limit(100).get()
    const existing = existingSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as PromptVersion)
      .find((version) => version.content === content)

    const now = new Date().toISOString()
    const seedLabel = `Seeded from prompts/${definition.filename}`
    const versionRef = existing ? versionsRef.doc(existing.id) : versionsRef.doc()
    const version: PromptVersion = existing ?? {
      id: versionRef.id,
      key: definition.key,
      content,
      label: seedLabel,
      createdAt: now,
      createdBy: 'prompt-seed',
    }

    await db.runTransaction(async (transaction) => {
      if (existing) {
        transaction.set(
          versionRef,
          {
            key: definition.key,
            label: seedLabel,
          },
          { merge: true }
        )
      } else {
        transaction.set(versionRef, version)
      }

      transaction.set(
        configRef,
        {
          activeVersionId: version.id,
          promptKey: definition.key,
          filename: definition.filename,
          updatedAt: now,
          updatedBy: 'prompt-seed',
        },
        { merge: true }
      )
    })

    console.log(
      `  ✓ ${definition.key} -> prompts/${definition.filename} (${existing ? 'activated existing' : 'created'})`
    )
  }

  console.log('✨ Prompt seed complete')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
