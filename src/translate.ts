import { z } from 'zod'
import { config } from './config'
import { Topico } from './summarize'
import { generateContentWithRetry, cleanGeminiJson } from './geminiHelper'

const translatedTopicSchema = z.object({
  fonte: z.string().min(1).max(300),
  pais: z.string().min(1).max(100),
  titulo: z.string().min(1).max(500),
  resumo: z.string().min(1).max(3000),
  link: z.string().min(1).max(4000),
  categoria: z.string().min(1).max(100).optional(),
}).strict()

export async function traduzirParaIngles(topicos: Topico[]): Promise<Topico[]> {
  if (topicos.length === 0) return []

  const topicosEn: Topico[] = []
  const TAMANHO_LOTE = 15

  console.log(`[translate] Traduzindo ${topicos.length} tópicos para o inglês em lotes de ${TAMANHO_LOTE}...`)

  for (let i = 0; i < topicos.length; i += TAMANHO_LOTE) {
    const lote = topicos.slice(i, i + TAMANHO_LOTE)
    console.log(`[translate] Traduzindo lote ${i / TAMANHO_LOTE + 1} de ${Math.ceil(topicos.length / TAMANHO_LOTE)}...`)

    const prompt = `
Please translate the following array of news topics from Portuguese to US English.
CRITICAL: You MUST maintain the exact same JSON structure and return the SAME number of items.
CRITICAL: Do NOT omit any fields. Do NOT use placeholders like "UNDEFINED". You must provide a full translation for every item.
Do NOT change the 'link' or 'fonte' fields. 
Translate the 'pais', 'titulo', 'resumo' and 'categoria' to natural, journalistic US English.

Input JSON:
${JSON.stringify(lote, null, 2)}

Output strictly in JSON array format:
`

    try {
      const loteSchema = z.array(translatedTopicSchema).length(lote.length)
      const result = await generateContentWithRetry(
        config.gemini.models.translation,
        prompt,
        z.toJSONSchema(loteSchema),
      )
      const text = result.text || '[]'
      const parsedText = cleanGeminiJson(text)
      const arr = loteSchema.parse(JSON.parse(parsedText))
      
      const preservesImmutableFields = arr.every((item, index) => (
        item.link === lote[index].link && item.fonte === lote[index].fonte
      ))
      if (!preservesImmutableFields) {
        throw new Error('A tradução alterou link ou fonte imutável.')
      }
      topicosEn.push(...arr)
    } catch (err) {
      console.error('[translate] erro ao parsear JSON do Gemini para um lote:', err)
      // Fallback para o português para este lote específico
      topicosEn.push(...lote)
    }
  }

  return topicosEn
}
