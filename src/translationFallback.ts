const CLOUD_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2'
const PUBLIC_GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single'
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
const MAX_BATCH_CHARS = 2400
const MAX_TRANSLATION_ATTEMPTS = 5
const BASE_RETRY_DELAY_MS = 2_000
const MAX_RETRY_DELAY_MS = 30_000
const BATCH_DELAY_MS = 750
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const TRANSLATABLE_KEYS = new Set(['pais', 'titulo', 'resumo', 'categoria', 'highlights', 'texto', 'dica'])

const KNOWN_TRANSLATIONS: Record<string, string> = {
  Brasil: 'Brazil',
  'Estados Unidos': 'United States',
  China: 'China',
  'Índia': 'India',
  'França': 'France',
  Alemanha: 'Germany',
  Espanha: 'Spain',
  'Reino Unido': 'United Kingdom',
  'Global/Outros': 'Global/Others',
  Emplacamentos: 'Sales/Registrations',
  'Lançamento': 'Launch',
  'Mercado Financeiro': 'Financial Market',
  'Comunicado Oficial': 'Official Press Release',
  Outros: 'Others',
  Outro: 'Other',
  Pesquisa: 'Research',
  'Preços/Valores': 'Pricing',
  'Negócios': 'Business',
  Ferramenta: 'Tool',
  'Novo Lançamento': 'New Launch',
  'Nova Tecnologia': 'New Technology',
  'Tendência do Setor': 'Industry Trend',
  'Conceito/Protótipo': 'Concept/Prototype',
}

type TranslationTarget = 'en' | 'pt'

interface TranslationEntry {
  original: string
  apply: Array<(translated: string) => void>
}

function collectTranslations(
  value: unknown,
  entries: Map<string, TranslationEntry>,
  parentKey = '',
): unknown {
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    value.forEach((item, index) => {
      if (typeof item === 'string' && TRANSLATABLE_KEYS.has(parentKey)) {
        queueTranslation(item, (translated) => { copy[index] = translated }, entries)
      } else {
        copy[index] = collectTranslations(item, entries, parentKey)
      }
    })
    return copy
  }

  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && TRANSLATABLE_KEYS.has(key)) {
        queueTranslation(child, (translated) => { copy[key] = translated }, entries)
      } else {
        copy[key] = collectTranslations(child, entries, key)
      }
    }
    return copy
  }

  return value
}

function queueTranslation(
  original: string,
  apply: (translated: string) => void,
  entries: Map<string, TranslationEntry>,
  useKnownTranslations = true,
): void {
  const normalized = original.trim()
  if (!normalized) {
    apply(original)
    return
  }

  const known = useKnownTranslations ? KNOWN_TRANSLATIONS[normalized] : undefined
  if (known) {
    apply(known)
    return
  }

  const existing = entries.get(normalized)
  if (existing) {
    existing.apply.push(apply)
    return
  }

  entries.set(normalized, { original: normalized, apply: [apply] })
}

function createBatches(entries: TranslationEntry[]): TranslationEntry[][] {
  const batches: TranslationEntry[][] = []
  let batch: TranslationEntry[] = []
  let size = 0

  for (const entry of entries) {
    const entrySize = entry.original.length + 16
    if (batch.length > 0 && size + entrySize > MAX_BATCH_CHARS) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(entry)
    size += entrySize
  }

  if (batch.length > 0) batches.push(batch)
  return batches
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')?.trim()
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.round(seconds * 1000))
    }

    const retryAt = Date.parse(retryAfter)
    if (Number.isFinite(retryAt)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - Date.now()))
    }
  }

  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (attempt - 1))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function fetchTranslation(
  url: string,
  init: RequestInit = {},
  provider = 'tradutor de contingência',
): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_TRANSLATION_ATTEMPTS; attempt += 1) {
    let response: Response

    try {
      const headers = new Headers(init.headers)
      headers.set('User-Agent', 'Mozilla/5.0 (compatible; TAP-Bilingual-Monitor/1.0)')
      response = await fetch(url, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(20_000),
      })
    } catch (err: unknown) {
      if (attempt === MAX_TRANSLATION_ATTEMPTS) {
        throw new Error(
          `${provider} falhou após ${attempt} tentativa(s): ${errorMessage(err)}`,
        )
      }

      const waitMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** (attempt - 1))
      console.warn(
        `[translate] ${provider}: falha de rede na tentativa ${attempt}/${MAX_TRANSLATION_ATTEMPTS}; repetindo em ${waitMs}ms.`,
      )
      await delay(waitMs)
      continue
    }

    if (response.ok) return response

    const retryable = RETRYABLE_HTTP_STATUS.has(response.status)
    if (!retryable || attempt === MAX_TRANSLATION_ATTEMPTS) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(
        `${provider} respondeu HTTP ${response.status} após ${attempt} tentativa(s)`,
      )
    }

    const waitMs = getRetryDelayMs(response, attempt)
    await response.body?.cancel().catch(() => undefined)
    console.warn(
      `[translate] ${provider}: HTTP ${response.status} na tentativa ${attempt}/${MAX_TRANSLATION_ATTEMPTS}; repetindo em ${waitMs}ms.`,
    )
    await delay(waitMs)
  }

  throw new Error(`${provider} esgotou as tentativas sem resposta`)
}

function cloudTranslateApiKey(): string {
  return process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY?.trim() || ''
}

async function translateWithCloud(
  source: string,
  apiKey: string,
  target: TranslationTarget = 'en',
): Promise<string> {
  const response = await fetchTranslation(
    `${CLOUD_TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: source, target, format: 'text' }),
    },
    'Cloud Translation',
  )

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw new Error('Cloud Translation retornou uma resposta inválida')
  }

  const data = (payload as { data?: { translations?: Array<{ translatedText?: unknown }> } }).data
  const translated = data?.translations?.[0]?.translatedText
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new Error('Cloud Translation não retornou o texto traduzido')
  }

  return translated
}

async function translateWithPublicFallback(
  source: string,
  target: TranslationTarget = 'en',
): Promise<string> {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: source })
  const response = await fetchTranslation(
    `${PUBLIC_GOOGLE_TRANSLATE_URL}?${params}`,
    {},
    'tradutor público de contingência',
  )

  const payload: unknown = await response.json()
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error('tradutor público de contingência retornou uma resposta inválida')
  }

  return payload[0]
    .filter((segment: unknown): segment is unknown[] => Array.isArray(segment))
    .map((segment) => typeof segment[0] === 'string' ? segment[0] : '')
    .join('')
}

async function translateWithMyMemory(
  source: string,
  target: TranslationTarget,
): Promise<string> {
  const sourceLang = target === 'en' ? 'pt' : 'en'
  const url = new URL(MYMEMORY_URL)
  url.searchParams.set('q', source)
  url.searchParams.set('langpair', `${sourceLang}|${target}`)

  const response = await fetchTranslation(url.toString(), {}, 'MyMemory')
  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw new Error('MyMemory retornou resposta inválida')
  }

  const translated = (payload as { responseData?: { translatedText?: unknown } })
    .responseData?.translatedText
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new Error('MyMemory não retornou texto traduzido')
  }

  return translated
}

async function translateBatchWithMyMemory(
  batch: TranslationEntry[],
  target: TranslationTarget,
): Promise<void> {
  for (const entry of batch) {
    const translated = await translateWithMyMemory(entry.original, target)
    entry.apply.forEach((apply) => apply(translated.trim()))
    await delay(250)
  }
}

function applyTranslatedBatch(batch: TranslationEntry[], translated: string): void {
  const marker = /ZXQ\s*(\d{4})\s*QXZ\s*/gi
  const matches = Array.from(translated.matchAll(marker))

  if (matches.length !== batch.length) {
    throw new Error(`tradutor de contingência retornou ${matches.length} segmentos para ${batch.length} textos`)
  }

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const sourceIndex = Number(current[1])
    const start = (current.index || 0) + current[0].length
    const end = matches[index + 1]?.index ?? translated.length
    const text = translated.slice(start, end).trim()

    if (sourceIndex !== index || !text) {
      throw new Error(`tradutor de contingência perdeu o segmento obrigatório ${index}`)
    }

    batch[sourceIndex].apply.forEach((apply) => apply(text))
  }
}

async function translateBatch(
  batch: TranslationEntry[],
  target: TranslationTarget = 'en',
): Promise<void> {
  const source = batch
    .map((entry, index) => `ZXQ${String(index).padStart(4, '0')}QXZ ${entry.original.replace(/\n/g, ' ')}`)
    .join('\n')

  const apiKey = cloudTranslateApiKey()

  try {
    let translated: string

    if (apiKey) {
      try {
        translated = await translateWithCloud(source, apiKey, target)
        console.log('[translate] Cloud Translation oficial concluiu o lote de contingência.')
      } catch (err: unknown) {
        console.warn(
          `[translate] Cloud Translation indisponível (${errorMessage(err)}); usando Google público.`,
        )
        translated = await translateWithPublicFallback(source, target)
      }
    } else {
      translated = await translateWithPublicFallback(source, target)
    }

    applyTranslatedBatch(batch, translated)
  } catch (err: unknown) {
    console.warn(
      `[translate] provedores Google indisponíveis (${errorMessage(err)}); usando MyMemory como última contingência.`,
    )
    await translateBatchWithMyMemory(batch, target)
  }
}

/**
 * Traduz dados editoriais sem consumir a cota do Gemini e preserva links, fontes e nomes de modelos.
 * Quando configurada, a API oficial Cloud Translation é priorizada; o endpoint público fica como última contingência.
 */
export async function traduzirEstruturaSemGemini<T>(original: T): Promise<T> {
  const entries = new Map<string, TranslationEntry>()
  const translated = collectTranslations(original, entries) as T

  const batches = createBatches(Array.from(entries.values()))
  for (let index = 0; index < batches.length; index += 1) {
    await translateBatch(batches[index])
    if (index < batches.length - 1) await delay(BATCH_DELAY_MS)
  }

  console.log(`[translate] contingência independente do Gemini concluiu ${entries.size} texto(s).`)
  return translated
}


/**
 * Traduz uma lista simples de textos sem usar o Gemini.
 * Usado para normalizar para PT-BR a contingência editorial construída a partir de RSS.
 */
export async function traduzirTextosSemGemini(
  textos: string[],
  target: TranslationTarget,
): Promise<string[]> {
  const translated = new Array<string>(textos.length)
  const entries = new Map<string, TranslationEntry>()

  textos.forEach((texto, index) => {
    queueTranslation(
      texto,
      (valor) => { translated[index] = valor },
      entries,
      false,
    )
  })

  const batches = createBatches(Array.from(entries.values()))
  for (let index = 0; index < batches.length; index += 1) {
    await translateBatch(batches[index], target)
    if (index < batches.length - 1) await delay(BATCH_DELAY_MS)
  }

  return translated
}
