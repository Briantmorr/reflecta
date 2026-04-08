import Anthropic from '@anthropic-ai/sdk'

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined }

export const anthropic =
  globalForAnthropic.anthropic ??
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

if (process.env.NODE_ENV !== 'production') globalForAnthropic.anthropic = anthropic

export async function generateReflectiveQuestions(htmlContent: string): Promise<string[]> {
  // Strip HTML tags for the LLM prompt
  const plainText = htmlContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plainText) return []

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    system: `You are a thoughtful journaling coach. Your role is to help writers deepen their self-reflection with meaningful, probing questions.`,
    messages: [
      {
        role: 'user',
        content: `Based on this journal entry, generate exactly 3 reflective questions that will help the writer explore their thoughts more deeply. The questions should be:
- Personal and specific to what was written (not generic)
- Open-ended to encourage deep reflection
- Varied: one about emotions/feelings, one about actions/next steps, one about patterns/growth

Return ONLY a JSON array of 3 question strings. No other text, no numbering, no markdown.

Journal entry:
${plainText}`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const parsed = JSON.parse(responseText.trim())
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 3).map((q) => String(q))
    }
  } catch {
    // Fallback: extract lines that look like questions
    const lines = responseText
      .split('\n')
      .map((l) => l.replace(/^[\d\.\-\*\s"]+/, '').replace(/["\s]+$/, '').trim())
      .filter((l) => l.length > 10 && l.endsWith('?'))
    if (lines.length > 0) return lines.slice(0, 3)
  }

  return []
}
