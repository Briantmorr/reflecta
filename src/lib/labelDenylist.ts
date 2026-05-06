import { prisma } from './db'
import { normalizeLabel } from './utils'

// Static denylist: high-frequency English verb forms and pronouns that are
// almost never legitimate node labels. Stable, hand-curated.
//
// Distinct from STOPWORDS (filler/articles) and MODIFIER_ONLY_NODE_LABELS
// (best/newest/etc.) which live in llm.ts and target different shapes.
export const STATIC_DENYLIST = new Set<string>([
  // pronouns
  'her', 'him', 'them', 'us', 'me',
  'hers', 'his', 'theirs', 'ours', 'mine',
  'himself', 'herself', 'themselves', 'myself', 'yourself', 'itself',
  'whose', 'whom',
  // common verb-gerunds (high-frequency English; almost never noun-as-practice)
  'talking', 'looking', 'saying', 'going', 'doing', 'being',
  'getting', 'having', 'making', 'seeing', 'feeling', 'thinking',
  'knowing', 'wanting', 'needing', 'taking', 'giving', 'trying',
  'coming', 'becoming', 'leaving', 'finding', 'putting',
  // common verb past/present forms
  'looks', 'looked', 'said', 'says', 'went', 'goes',
  'done', 'does', 'did', 'been', 'is', 'are', 'was', 'were',
  'got', 'gets', 'had', 'has', 'made', 'makes',
  'saw', 'seen', 'sees', 'felt', 'feels',
  'thought', 'thinks', 'knew', 'knows',
])

// Dynamic denylist: labels we've actively deleted from the graph (orphan
// cleanup, audit --apply, manual removal). Cached in-process.
let dynamicCache: Set<string> = new Set()
let dynamicLoadedAt = 0
const DYNAMIC_TTL_MS = 60_000

export async function ensureDenylistLoaded(): Promise<void> {
  if (Date.now() - dynamicLoadedAt < DYNAMIC_TTL_MS) return
  try {
    const rows = await prisma.rejectedLabel.findMany({ select: { label: true } })
    dynamicCache = new Set(rows.map((r) => r.label))
    dynamicLoadedAt = Date.now()
  } catch {
    // Table might not exist yet (pre-migration). Treat as empty.
    dynamicCache = new Set()
    dynamicLoadedAt = Date.now()
  }
}

export function isLabelDenied(normalized: string): boolean {
  return STATIC_DENYLIST.has(normalized) || dynamicCache.has(normalized)
}

export async function addToDenylist(rawLabel: string, reason: string): Promise<void> {
  const normalized = normalizeLabel(rawLabel)
  if (!normalized) return
  if (STATIC_DENYLIST.has(normalized)) return
  try {
    await prisma.rejectedLabel.upsert({
      where: { label: normalized },
      create: { label: normalized, reason },
      update: { reason },
    })
    dynamicCache.add(normalized)
  } catch (err) {
    console.warn('[labelDenylist] failed to record', normalized, err)
  }
}

export async function removeFromDenylist(rawLabel: string): Promise<void> {
  const normalized = normalizeLabel(rawLabel)
  if (!normalized) return
  try {
    await prisma.rejectedLabel.delete({ where: { label: normalized } }).catch(() => {})
    dynamicCache.delete(normalized)
  } catch (err) {
    console.warn('[labelDenylist] failed to remove', normalized, err)
  }
}

// Test-only: force a fresh load from the DB on next call. Production code
// should not need this; the TTL handles steady-state.
export function invalidateDenylistCache(): void {
  dynamicLoadedAt = 0
}
