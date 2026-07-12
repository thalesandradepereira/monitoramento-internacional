import Parser from 'rss-parser'
import { config } from './config'
import { FONTES_RSS } from './sources'
import { getSentNewsHistory } from './history'
import { GoogleDecoder } from 'google-news-url-decoder'
import pLimit from 'p-limit'

const parser = new Parser({ timeout: 15000 })
const decoder = new GoogleDecoder()

export interface Noticia {
  fonte: string
  titulo: string
  link: string
  data: Date
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/gi, '').trim()
}

export async function buscarNoticias(): Promise<Noticia[]> {
  const corte = Date.now() - config.janelaHoras * 60 * 60 * 1000
  const history = getSentNewsHistory().map(normalizeTitle)
  const historySet = new Set(history)

  const resultados = await Promise.allSettled(
    FONTES_RSS.map(async (f) => {
      const feed = await parser.parseURL(f.url)
      const itens: Noticia[] = []
      for (const item of feed.items || []) {
        const iso = item.isoDate || item.pubDate
        const data = iso ? new Date(iso) : null
        if (!data || isNaN(data.getTime()) || data.getTime() < corte) continue
        if (!item.title || !item.link) continue
        itens.push({
          fonte: f.nome,
          titulo: item.title.trim(),
          link: item.link.trim(),
          data,
        })
      }
      return itens
    })
  )

  const noticias: Noticia[] = []
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') noticias.push(...r.value)
    else console.warn(`[fetch] fonte falhou: ${FONTES_RSS[i].nome} — ${r.reason?.message || r.reason}`)
  })

  // Dedup e histórico
  const vistos = new Set<string>()
  const unicas = noticias
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .filter((n) => {
      const chave = normalizeTitle(n.titulo).slice(0, 80)
      if (vistos.has(chave) || historySet.has(chave)) return false
      vistos.add(chave)
      return true
    })

  console.log(`[fetch] ${unicas.length} notícias únicas nas últimas ${config.janelaHoras}h (de ${FONTES_RSS.length} fontes)`)

  console.log(`[fetch] Decodificando URLs do Google News (isso pode levar alguns minutos)...`)
  const limit = pLimit(5) // Limit concurrency to avoid being blocked completely
  const decodedNoticias = await Promise.all(
    unicas.map((n) =>
      limit(async () => {
        try {
          // Some urls might not be google news CBMs, decoder returns status:false gracefully
          const result = await decoder.decode(n.link)
          if (result && result.status && result.decoded_url) {
            return { ...n, link: result.decoded_url }
          }
        } catch (error) {
          // Silently fail and use original
        }
        return n
      })
    )
  )

  console.log(`[fetch] Decodificação concluída!`)
  return decodedNoticias
}
