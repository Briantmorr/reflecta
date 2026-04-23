import 'dotenv/config'

let prismaForDisconnect: typeof import('../src/lib/db').prisma | null = null

function parseArgs(argv: string[]) {
  return {
    fresh: argv.includes('--fresh'),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [{ prisma }, { populateNodeContextForAllNodes }] = await Promise.all([
    import('../src/lib/db'),
    import('../src/lib/nodeContext'),
  ])
  prismaForDisconnect = prisma

  const nodeCount = await prisma.graphNode.count({
    where: { type: { not: 'emotion' } },
  })
  console.log(
    `[INFO] Backfilling node context for ${nodeCount} node${nodeCount === 1 ? '' : 's'}${args.fresh ? ' (fresh regen)' : ''}`
  )

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] No OPENAI_API_KEY — node context will be populated via mock fallback')
  }

  const startedAt = Date.now()
  const results = await populateNodeContextForAllNodes({
    preserveExistingContext: !args.fresh,
  })

  for (const result of results) {
    console.log(
      `[OK] ${result.label} (${result.type}) conversations=${result.conversationCount} updatedAt=${result.updatedAt}`
    )
  }

  const populatedCount = await prisma.graphNode.count({
    where: {
      type: { not: 'emotion' },
      contextText: { not: null },
    },
  })

  console.log(
    `[SUMMARY] populated=${populatedCount}/${nodeCount} elapsedMs=${Date.now() - startedAt}`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prismaForDisconnect?.$disconnect()
  })
