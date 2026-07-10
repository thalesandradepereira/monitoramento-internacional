import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from './config'
import { Topico } from './summarize'

const genAI = new GoogleGenerativeAI(config.gemini.apiKey)

export async function traduzirParaIngles(topicos: Topico[]): Promise<Topico[]> {
  if (topicos.length === 0) return []

  const model = genAI.getGenerativeModel({ model: config.gemini.model })

  const prompt = `
Please translate the following array of news topics from Portuguese to US English.
Maintain the exact same JSON structure. Do NOT change the links or the source names. 
Translate the 'pais', 'titulo' and 'resumo' to natural, journalistic US English.

Input JSON:
${JSON.stringify(topicos, null, 2)}

Output strictly in JSON:
`

  console.log(`[translate] Traduzindo ${topicos.length} tópicos para o inglês...`)
  const result = await model.generateContent(prompt)
  const text = result.response.text() || '[]'
  
  const limpo = text.replace(/```json/g, '').replace(/```/g, '').trim()
  try {
    const arr = JSON.parse(limpo)
    return Array.isArray(arr) ? arr : topicos
  } catch (err) {
    console.error('[translate] erro ao parsear JSON do Gemini:', err)
    return topicos
  }
}
