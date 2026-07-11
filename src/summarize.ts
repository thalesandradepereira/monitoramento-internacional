import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from './config'
import { Noticia } from './fetchNews'
import { generateContentWithRetry } from './geminiHelper'

const genAI = new GoogleGenerativeAI(config.gemini.apiKey)

export interface Topico {
  fonte: string
  pais: string
  titulo: string
  resumo: string
  link: string
  categoria?: string
}

interface Candidato {
  fonte: string
  pais: string
  titulo: string
  link: string
}

const paisesPermitidos = [
  'Brasil', 'Estados Unidos', 'França', 'Inglaterra', 'Espanha', 
  'Alemanha', 'Japão', 'China', 'Índia', 'Portugal'
]

export async function resumirNoticias(noticias: Noticia[]): Promise<Topico[]> {
  if (noticias.length === 0) return []
  
  const model = genAI.getGenerativeModel({ model: config.gemini.model })
  
  // ==========================================
  // PASSO 1: TRIAGEM DE CANDIDATOS (MAP)
  // ==========================================
  const TAMANHO_LOTE_TRIAGEM = 150 // Podemos usar um lote maior porque o output será curto (baixo uso de tokens)
  const lotes: Noticia[][] = []
  for (let i = 0; i < noticias.length; i += TAMANHO_LOTE_TRIAGEM) {
    lotes.push(noticias.slice(i, i + TAMANHO_LOTE_TRIAGEM))
  }

  console.log(`[summarize] PASSO 1: Triagem barata. Extraindo candidatos de ${noticias.length} notícias em ${lotes.length} lotes.`)
  
  const todosCandidatos: Candidato[] = []

  for (let i = 0; i < lotes.length; i++) {
    console.log(`[summarize] Triando lote ${i + 1}/${lotes.length} (${lotes[i].length} matérias)...`)
    const lote = lotes[i]

    const promptTriagem = `
Analise o seguinte lote de notícias.
Sua tarefa é fazer uma TRIAGEM RÁPIDA das notícias sobre: Inovações Tecnológicas, Avanços Científicos e Assuntos em Alta.

Regras:
1. Escolha as mais relevantes para os seguintes países: ${paisesPermitidos.join(', ')}.
2. NÃO traduza o título.
3. NÃO crie nenhum resumo.
4. Apenas extraia os dados básicos originais para economizar tokens.

Retorne ESTRITAMENTE em JSON com a estrutura:
[
  {
    "pais": "Nome do País",
    "titulo": "Título original",
    "link": "URL original",
    "fonte": "Nome da fonte"
  }
]

NOTÍCIAS:
${JSON.stringify(lote, null, 2)}
`

    try {
      const result = await generateContentWithRetry(model, promptTriagem)
      let limpo = (result.response.text() || '[]').replace(/```json/gi, '').replace(/```/g, '').trim()
      const match = limpo.match(/\[[\s\S]*\]/)
      if (match) limpo = match[0]
      
      const arr: Candidato[] = JSON.parse(limpo)
      if (Array.isArray(arr)) {
        todosCandidatos.push(...arr)
        console.log(`[summarize] Lote ${i + 1} encontrou ${arr.length} candidatos relevantes.`)
      }
    } catch (err) {
      console.error(`[summarize] Erro no JSON do lote de triagem ${i + 1}:`, err)
    }
  }

  // ==========================================
  // AGRUPAMENTO INTERMEDIÁRIO (POR PAÍS)
  // ==========================================
  console.log(`[summarize] Agrupando ${todosCandidatos.length} candidatos totais por país...`)
  const candidatosPorPais: Record<string, Candidato[]> = {}
  for (const p of paisesPermitidos) {
    candidatosPorPais[p] = []
  }

  for (const c of todosCandidatos) {
    // Normalizar nome do país
    const paisEncontrado = paisesPermitidos.find(p => p.toLowerCase() === c.pais.toLowerCase()) || c.pais
    if (candidatosPorPais[paisEncontrado]) {
      // Evitar candidatos duplicados via link
      if (!candidatosPorPais[paisEncontrado].some(ex => ex.link === c.link)) {
        candidatosPorPais[paisEncontrado].push(c)
      }
    }
  }

  // ==========================================
  // PASSO 2: ESCOLHA E RESUMO (REDUCE)
  // ==========================================
  console.log(`[summarize] PASSO 2: Decisão Qualitativa. Traduzindo e resumindo os melhores finalistas por país.`)
  const topicosFinais: Topico[] = []

  for (const pais of paisesPermitidos) {
    const candidatosDoPais = candidatosPorPais[pais]
    
    if (candidatosDoPais.length === 0) {
      console.log(`[summarize] Nenhum candidato finalista para ${pais}. Pulando.`)
      continue
    }

    console.log(`[summarize] Avaliando ${candidatosDoPais.length} candidatos de ${pais}...`)

    const promptResumo = `
Abaixo estão os ${candidatosDoPais.length} melhores artigos candidatos hoje para o país: ${pais}.

Tarefa:
1. Compare rigorosamente todos os artigos e ESCOLHA APENAS OS 8 MELHORES e mais importantes focados em Tecnologia, Ciência e Trending Topics. Se houver menos de 8 artigos no total, utilize todos.
2. Para os finalistas escolhidos, TRADUZA O TÍTULO para Português do Brasil.
3. Para os finalistas escolhidos, escreva um resumo de altíssima qualidade em Português do Brasil contendo exatamente entre 3 e 5 linhas para sintetizar o contexto e impacto.
4. Adicione um campo "categoria" em MAIÚSCULAS contendo de 1 a 2 palavras que classifique a notícia (ex: LANÇAMENTO, MERCADO, TECNOLOGIA, CIÊNCIA, POLÍTICA).

Retorne ESTRITAMENTE em JSON com a estrutura:
[
  {
    "pais": "${pais}",
    "titulo": "Título traduzido",
    "resumo": "O resumo elaborado...",
    "link": "URL original",
    "fonte": "Nome da fonte",
    "categoria": "CATEGORIA"
  }
]

CANDIDATOS:
${JSON.stringify(candidatosDoPais, null, 2)}
`

    try {
      const result = await generateContentWithRetry(model, promptResumo)
      let limpo = (result.response.text() || '[]').replace(/```json/gi, '').replace(/```/g, '').trim()
      const match = limpo.match(/\[[\s\S]*\]/)
      if (match) limpo = match[0]
      
      const arr: Topico[] = JSON.parse(limpo)
      if (Array.isArray(arr)) {
        // Garantir que a IA respeitou o limite de 8 por segurança matemática
        const aprovados = arr.slice(0, 8)
        topicosFinais.push(...aprovados)
        console.log(`[summarize] ${pais} consolidou ${aprovados.length} super notícias "Diamante".`)
      }
    } catch (err) {
      console.error(`[summarize] Erro no JSON de consolidação de ${pais}:`, err)
    }
  }

  console.log(`[summarize] Processamento Diamante concluído. Retornando ${topicosFinais.length} tópicos supremos.`)
  return topicosFinais
}
