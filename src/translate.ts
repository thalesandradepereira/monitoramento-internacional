import { z } from 'zod'
import { config } from './config'
import { Topico } from './summarize'
import { generateContentWithRetry, cleanGeminiJson } from './geminiHelper'
import { traduzirEstruturaSemGemini } from './translationFallback'

const translatedTopicSchema = z.object({
  fonte: z.string().min(1).max(300),
  pais: z.string().min(1).max(100),
  titulo: z.string().min(1).max(500),
  resumo: z.string().min(1).max(3000),
  link: z.string().min(1).max(4000),
  categoria: z.string().min(1).max(100).optional(),
}).strict()

function assertImmutableFields(translated: Topico[], original: Topico[]): void {
  const preservesImmutableFields = translated.every((item, index) => (
    item.link === original[index].link && item.fonte === original[index].fonte
  ))
  if (!preservesImmutableFields) {
    throw new Error('A tradução alterou link ou fonte imutável.')
  }
}

export async function traduzirParaIngles(topicos: Topico[]): Promise<Topico[]> {
  if (topicos.length === 0) return []

  const topicosEn: Topico[] = []
  const TAMANHO_LOTE = 15

  console.log(`[translate] Traduzindo ${topicos.length} tópicos para o inglês em lotes de ${TAMANHO_LOTE}...`)

  for (let i = 0; i < topicos.length; i += TAMANHO_LOTE) {
    const lote = topicos.slice(i, i + TAMANHO_LOTE)
    const loteSchema = z.array(translatedTopicSchema).length(lote.length)
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
      const result = await generateContentWithRetry(
        config.gemini.models.translation,
        prompt,
        z.toJSONSchema(loteSchema),
      )
      const text = result.text || '[]'
      const parsedText = cleanGeminiJson(text)
      const arr = loteSchema.parse(JSON.parse(parsedText))
      assertImmutableFields(arr, lote)
      topicosEn.push(...arr)
    } catch (err) {
      console.warn(
        '[translate] Gemini não produziu um lote inglês íntegro; acionando contingência independente:',
        err,
      )

      const fallback = loteSchema.parse(await traduzirEstruturaSemGemini(lote))
      assertImmutableFields(fallback, lote)
      topicosEn.push(...fallback)
    }
  }

  if (topicosEn.length !== topicos.length) {
    throw new Error('Versão em inglês incompleta; envio bilíngue bloqueado.')
  }

  return topicosEn
}
