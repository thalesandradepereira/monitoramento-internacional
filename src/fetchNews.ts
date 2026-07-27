import Parser from 'rss-parser'
import { config } from './config'
import { FONTES_RSS } from './sources'
import { getSentNewsHistory } from './history'
import { GoogleDecoder } from 'google-news-url-decoder'
import pLimit from 'p-limit'

const parser = new Parser()
const decoder = new GoogleDecoder()
const RSS_FETCH_TIMEOUT_MS = 20_000
const RSS_FETCH_ATTEMPTS = 3
const RSS_FETCH_CONCURRENCY = 2
const RSS_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const RSS_REQUEST_HEADERS = {
  accept: 'application/rss+xml, application/xml;q=0.9',
  'user-agent': 'MonitoramentoInternacional/1.0 (+https://github.com/thalesandradepereira/monitoramento-internacional)',
}

interface RssHttpError extends Error {
  status?: number
  retryAfterMs?: number
}

export interface Noticia {
  fonte: string
  pais: string
  titulo: string
  link: string
  data: Date
}

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .trim()
}

export function newsHistoryKey(title: string): string {
  return normalizeTitle(title).slice(0, 160)
}

export function isRetryableRssError(error: unknown): boolean {
  const status = (error as RssHttpError | undefined)?.status
  if (status !== undefined) return RSS_RETRYABLE_STATUSES.has(status)

  const message = error instanceof Error ? error.message : String(error)
  const statusMatch = message.match(/\b(408|429|500|502|503|504)\b/)
  return statusMatch !== null
    || /abort|network|socket|timeout|timed out|fetch failed|econnreset|enotfound/i.test(message)
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - Date.now())
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchRssXml(
  url: string,
  fetchImpl: typeof fetch = fetch,
  waitImpl: (ms: number) => Promise<void> = wait,
): Promise<string> {
  let lastError: unknown

  for (let attempt = 1; attempt <= RSS_FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS)

    try {
      const response = await fetchImpl(url, {
        headers: RSS_REQUEST_HEADERS,
        redirect: 'follow',
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`) as RssHttpError
        error.status = response.status
        error.retryAfterMs = retryAfterMilliseconds(response.headers.get('retry-after'))
        throw error
      }

      const xml = await response.text()
      if (!xml.trim()) throw new Error('Feed RSS vazio')
      return xml
    } catch (error) {
      lastError = error
      if (attempt === RSS_FETCH_ATTEMPTS || !isRetryableRssError(error)) throw error

      const retryAfterMs = (error as RssHttpError | undefined)?.retryAfterMs
      const delayMs = Math.max(retryAfterMs ?? 0, attempt * 2_000)
      await waitImpl(delayMs)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError
}

export async function buscarNoticias(): Promise<Noticia[]> {
  const corte = Date.now() - config.janelaHoras * 60 * 60 * 1000
  const history = getSentNewsHistory().map(newsHistoryKey).filter(Boolean)
  const historySet = new Set(history)
  const fetchLimit = pLimit(RSS_FETCH_CONCURRENCY)

  const resultados = await Promise.allSettled(
    FONTES_RSS.map((f) => fetchLimit(async () => {
      const xml = await fetchRssXml(f.url)
      const feed = await parser.parseString(xml)
      const itens: Noticia[] = []
      for (const item of feed.items || []) {
        const iso = item.isoDate || item.pubDate
        const data = iso ? new Date(iso) : null
        if (!data || isNaN(data.getTime()) || data.getTime() < corte) continue
        if (!item.title || !item.link) continue
        
        // Extrai a fonte verdadeira (geralmente vem no creator ou no final do título após " - ")
        let fonteReal = item.creator || 'Notícias'
        let tituloLimpo = item.title.trim()
        const lastDash = tituloLimpo.lastIndexOf(' - ')
        if (lastDash !== -1 && !item.creator) {
           fonteReal = tituloLimpo.substring(lastDash + 3).trim()
           tituloLimpo = tituloLimpo.substring(0, lastDash).trim()
        } else if (lastDash !== -1) {
           tituloLimpo = tituloLimpo.substring(0, lastDash).trim()
        }

        itens.push({
          fonte: fonteReal,
          pais: f.nome,
          titulo: tituloLimpo,
          link: item.link.trim(),
          data,
        })
      }
      return itens
    }))
  )

  const noticias: Noticia[] = []
  const successfulSources = resultados.filter(result => result.status === 'fulfilled').length
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') noticias.push(...r.value)
    else console.warn(`[fetch] fonte falhou: ${FONTES_RSS[i].nome} — ${r.reason?.message || r.reason}`)
  })

  if (config.minSuccessfulSources > FONTES_RSS.length) {
    throw new Error(`[fetch] MIN_SUCCESSFUL_SOURCES=${config.minSuccessfulSources} excede as ${FONTES_RSS.length} fontes configuradas.`)
  }
  if (successfulSources < config.minSuccessfulSources) {
    throw new Error(`[fetch] Cobertura insuficiente: ${successfulSources}/${FONTES_RSS.length} fontes responderam; mínimo=${config.minSuccessfulSources}.`)
  }

  // Dedup e histórico
  const vistos = new Set<string>()
  const unicas = noticias
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .filter((n) => {
      const chave = newsHistoryKey(n.titulo)
      if (!chave) return false
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
