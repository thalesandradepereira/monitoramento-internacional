import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from './config'
import { Noticia } from './fetchNews'

const genAI = new GoogleGenerativeAI(config.gemini.apiKey)

export interface Topico {
  fonte: string
  pais: string
  titulo: string
  resumo: string
  link: string
}

export async function resumirNoticias(noticias: Noticia[]): Promise<Topico[]> {
  if (noticias.length === 0) return []

  const model = genAI.getGenerativeModel({ model: config.gemini.model })

  const prompt = `
Abaixo está uma lista de notícias de 10 países das últimas 24h.
Os 10 países são: Brasil, Estados Unidos, França, Inglaterra, Espanha, Alemanha, Japão, China, Índia e Portugal.
Sua tarefa é selecionar EXATAMENTE 5 notícias relevantes para CADA UM DOS 10 PAÍSES, totalizando 50 notícias no máximo. Se um país não tiver 5 notícias, pegue todas as disponíveis daquele país.
Você NÃO PODE parar a geração antes de fornecer as notícias de TODOS os 10 países.
FOCO OBRIGATÓRIO: Economia, Ciência, Tecnologia, Esportes, Conflitos e Política Interna.
Para cada notícia selecionada:
1. TRADUZA O TÍTULO OBRIGATORIAMENTE para o Português do Brasil. Nenhum título pode ficar em inglês ou na língua original.
2. Escreva um resumo em Português do Brasil contendo de 3 a 5 linhas que sintetizem a reportagem.

Responda ESTRITAMENTE em JSON com a estrutura:
[
  {
    "pais": "Nome do País",
    "titulo": "Título da notícia OBRIGATORIAMENTE traduzido para Português do Brasil",
    "resumo": "O resumo de 3 a 5 linhas...",
    "link": "URL original da notícia",
    "fonte": "Nome da fonte original"
  }
]

NOTÍCIAS (em JSON):
${JSON.stringify(noticias, null, 2)}
`

  console.log(`[summarize] Chamando Gemini para resumir ${noticias.length} notícias...`)
  const result = await model.generateContent(prompt)
  const text = result.response.text() || '[]'
  
  const limpo = text.replace(/```json/g, '').replace(/```/g, '').trim()
  try {
    const arr = JSON.parse(limpo)
    return Array.isArray(arr) ? arr.slice(0, config.maxTopicos) : []
  } catch (err) {
    console.error('[summarize] erro ao parsear JSON do Gemini:', err)
    return []
  }
}
