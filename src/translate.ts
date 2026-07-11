import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from './config'
import { Topico } from './summarize'
import { generateContentWithRetry } from './geminiHelper'

const genAI = new GoogleGenerativeAI(config.gemini.apiKey)

export async function traduzirParaIngles(topicos: Topico[]): Promise<Topico[]> {
  if (topicos.length === 0) return []

  const model = genAI.getGenerativeModel({ 
    model: config.gemini.model,
    generationConfig: { responseMimeType: "application/json" }
  })
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
      const result = await generateContentWithRetry(model, prompt)
      const text = result.response.text() || '[]'
      const parsedText = text
      const arr = JSON.parse(parsedText)
      
      if (Array.isArray(arr)) {
        topicosEn.push(...arr)
      } else {
        console.warn(`[translate] Lote não retornou array, usando original (PT-BR) como fallback.`)
        topicosEn.push(...lote)
      }
    } catch (err) {
      console.error('[translate] erro ao parsear JSON do Gemini para um lote:', err)
      // Fallback para o português para este lote específico
      topicosEn.push(...lote)
    }
  }

  return topicosEn
}
