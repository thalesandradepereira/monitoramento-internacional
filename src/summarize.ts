import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from './config'
import { Noticia } from './fetchNews'
import { generateContentWithRetry, cleanGeminiJson } from './geminiHelper'

const genAI = new GoogleGenerativeAI(config.gemini.apiKey)

export interface Topico {
  fonte: string
  pais: string
  titulo: string
  resumo: string
  link: string
  categoria?: string
}

interface Candidato extends Noticia {
  id: string
  pais: string
}

const paisesPermitidos = [
  'Brasil', 'Estados Unidos', 'França', 'Inglaterra', 'Espanha', 
  'Alemanha', 'Japão', 'China', 'Índia', 'Portugal'
]

function normalizarPais(pais: string): string | null {
  if (!pais) return null;
  const p = pais.toLowerCase().trim();
  if (p === 'eua' || p === 'usa' || p === 'estados unidos' || p === 'us' || p === 'united states') return 'Estados Unidos';
  if (p === 'br' || p === 'brasil' || p === 'brazil') return 'Brasil';
  if (p === 'uk' || p === 'inglaterra' || p === 'reino unido' || p === 'england' || p === 'united kingdom') return 'Inglaterra';
  if (p === 'frança' || p === 'france' || p === 'franca') return 'França';
  if (p === 'espanha' || p === 'spain') return 'Espanha';
  if (p === 'alemanha' || p === 'germany' || p === 'deutschland') return 'Alemanha';
  if (p === 'japão' || p === 'japao' || p === 'japan') return 'Japão';
  if (p === 'china') return 'China';
  if (p === 'índia' || p === 'india') return 'Índia';
  if (p === 'portugal') return 'Portugal';
  return null;
}

export async function resumirNoticias(noticias: Noticia[]): Promise<Topico[]> {
  if (noticias.length === 0) return []
  
  const model = genAI.getGenerativeModel({ 
    model: config.gemini.model,
    generationConfig: { responseMimeType: "application/json" }
  })
  
  // ==========================================
  // PASSO 1: TRIAGEM DE CANDIDATOS (MAP)
  // ==========================================
  // O Gemini 2.5 Flash tem 1 Milhão de tokens de contexto.
  // Vamos usar um lote de 200 (gera 4 chamadas seguras contra truncation) 
  // já que agora temos o gemini-1.5-flash com limite gigante de requisições.
  const TAMANHO_LOTE_TRIAGEM = 200 
  const noticiasComId = noticias.map((n, idx) => ({ ...n, id: idx.toString() }))
  const lotes: typeof noticiasComId[] = []
  for (let i = 0; i < noticiasComId.length; i += TAMANHO_LOTE_TRIAGEM) {
    lotes.push(noticiasComId.slice(i, i + TAMANHO_LOTE_TRIAGEM))
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
    "id": "id original",
    "pais": "Nome do País"
  }
]

NOTÍCIAS:
${JSON.stringify(lote.map(n => ({ id: n.id, titulo: n.titulo, fonte: n.fonte })), null, 2)}
`

    try {
      const result = await generateContentWithRetry(model, promptTriagem)
      const limpo = cleanGeminiJson(result.response.text() || '[]')
      
      const arr: { id: string, pais: string }[] = JSON.parse(limpo)
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const original = lote.find(n => n.id === item.id)
          if (original) {
            const paisNorm = normalizarPais(item.pais)
            if (paisNorm) {
              todosCandidatos.push({ ...original, pais: paisNorm })
            }
          }
        }
        console.log(`[summarize] Lote ${i + 1} encontrou ${todosCandidatos.length} candidatos válidos até agora.`)
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
    // Aqui c.pais já está normalizado
    const paisEncontrado = c.pais
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
  console.log(`[summarize] PASSO 2: Decisão Qualitativa. Resumindo TODOS os países em uma única chamada.`)
  const topicosFinais: Topico[] = []

  // Prepara o objeto com apenas o essencial (id e titulo) para economizar tokens
  const payloadResumo: Record<string, {id: string, titulo: string}[]> = {}
  let totalCandidatos = 0
  for (const pais of paisesPermitidos) {
    if (candidatosPorPais[pais].length > 0) {
      payloadResumo[pais] = candidatosPorPais[pais].map(c => ({ id: c.id, titulo: c.titulo }))
      totalCandidatos += payloadResumo[pais].length
    }
  }

  if (totalCandidatos === 0) {
    console.log(`[summarize] Nenhum candidato finalista encontrado no total.`)
    return []
  }

  console.log(`[summarize] Enviando ${totalCandidatos} candidatos agrupados por país para a decisão final...`)

  const promptResumo = `
Abaixo estão os melhores artigos candidatos hoje, separados por país.

Tarefa:
1. Para CADA PAÍS listado, compare rigorosamente os artigos e ESCOLHA APENAS OS 8 MELHORES focados em Tecnologia, Ciência e Trending Topics. Se o país tiver menos de 8 artigos, utilize todos.
2. TRADUZA O TÍTULO para Português do Brasil.
3. Escreva um resumo em Português do Brasil contendo exatamente entre 3 e 5 linhas para sintetizar o contexto e impacto.
4. Adicione um campo "categoria" em MAIÚSCULAS contendo de 1 a 2 palavras (ex: LANÇAMENTO, TECNOLOGIA, NEGÓCIOS).

Retorne ESTRITAMENTE em JSON com uma única lista contendo as notícias aprovadas de TODOS os países juntos, seguindo esta estrutura:
[
  {
    "id": "id original",
    "titulo": "Título traduzido",
    "resumo": "O resumo elaborado...",
    "categoria": "CATEGORIA"
  }
]

CANDIDATOS POR PAÍS:
${JSON.stringify(payloadResumo, null, 2)}
`

  try {
    const result = await generateContentWithRetry(model, promptResumo)
    const limpo = cleanGeminiJson(result.response.text() || '[]')
    
    const arr: { id: string, titulo: string, resumo: string, categoria?: string }[] = JSON.parse(limpo)
    if (Array.isArray(arr)) {
      // Reconstroi os dados recuperando o link e a fonte original
      const aprovados = arr.map(item => {
        // Encontra o candidato original buscando em todas as listas de países
        let original: Candidato | undefined
        for (const lista of Object.values(candidatosPorPais)) {
          original = lista.find(c => c.id === item.id)
          if (original) break
        }
        
        if (!original) return null
        return {
          fonte: original.fonte,
          pais: original.pais,
          titulo: item.titulo,
          resumo: item.resumo,
          link: original.link,
          categoria: item.categoria
        } as Topico
      }).filter(Boolean) as Topico[]
      
      topicosFinais.push(...aprovados)
      console.log(`[summarize] IA retornou ${aprovados.length} super notícias no total consolidado.`)
    }
  } catch (err) {
    console.error(`[summarize] Erro no JSON de consolidação do Passo 2:`, err)
  }

  console.log(`[summarize] Processamento Diamante concluído. Retornando ${topicosFinais.length} tópicos supremos.`)
  return topicosFinais
}
