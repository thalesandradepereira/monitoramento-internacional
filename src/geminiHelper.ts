import { ApiError, GoogleGenAI } from '@google/genai'
import { config } from './config'

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])
// O modelo editorial gratuito admite 5 RPM no projeto atual. Treze segundos
// preservam margem sobre a janela de 60 segundos e evitam rajadas de 429.
const MIN_REQUEST_INTERVAL_MS = 13000

let client: GoogleGenAI | undefined

const UNSUPPORTED_GEMINI_SCHEMA_KEYWORDS = new Set([
  '$schema',
  'additionalProperties',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
])

type GeminiStructuredResponse = {
  text?: string
}

export function getGeminiClient(): GoogleGenAI {
  if (!config.gemini.apiKey) {
    throw new Error('[gemini] GEMINI_API_KEY não configurada.')
  }
  if (!client) {
    client = new GoogleGenAI({
      apiKey: config.gemini.apiKey,
      httpOptions: {
        timeout: config.gemini.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    })
  }
  return client
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    if (Number.isInteger(status)) return status
  }
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/\b(408|429|500|502|503|504)\b/)
  return match ? Number(match[1]) : undefined
}

export function isGeminiQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /exceeded your current quota/i.test(message)
    || /quota exceeded for metric:/i.test(message)
}

export function isRetryableGeminiError(error: unknown): boolean {
  if (isGeminiQuotaExhausted(error)) return false
  const status = errorStatus(error)
  return status !== undefined && RETRYABLE_HTTP_STATUSES.has(status)
}

export function sanitizeGeminiJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(item => sanitizeGeminiJsonSchema(item))
  }
  if (!schema || typeof schema !== 'object') {
    return schema
  }

  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED_GEMINI_SCHEMA_KEYWORDS.has(key))
      .map(([key, value]) => [key, sanitizeGeminiJsonSchema(value)]),
  )
}

function retryDelayMs(error: unknown, attempt: number): number {
  const message = error instanceof Error ? error.message : String(error)
  const retryMatch = message.match(/retry(?:\s+in|\s+after)?\s+(\d+(?:\.\d+)?)s/i)
  if (retryMatch) return Math.ceil((Number(retryMatch[1]) + 2) * 1000)
  if (errorStatus(error) === 429) return 40000
  const exponential = Math.min(30000, 2000 * 2 ** Math.max(0, attempt - 1))
  return exponential + Math.floor(Math.random() * 1000)
}

export async function generateContentWithRetry(
  model: string,
  prompt: string,
  responseJsonSchema?: unknown,
  retries = 3,
): Promise<GeminiStructuredResponse> {
  const gemini = getGeminiClient()
  const apiSchema = sanitizeGeminiJsonSchema(responseJsonSchema)

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(`[gemini] modelo=${model}; tentativa=${attempt}/${retries}; aguardando intervalo preventivo`)
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS))

      const response = await gemini.interactions.create({
        model,
        input: prompt,
        store: false,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          ...(apiSchema && typeof apiSchema === 'object' ? { schema: apiSchema } : {}),
        },
      })
      return { text: response.output_text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryable = isRetryableGeminiError(error)
      console.error(`[gemini] Falha; modelo=${model}; tentativa=${attempt}/${retries}; retryable=${retryable}; detalhe=${message}`)

      if (!retryable || attempt >= retries) throw error

      const waitTime = retryDelayMs(error, attempt)
      console.log(`[gemini] Aguardando ${waitTime}ms antes da próxima tentativa.`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw new Error('[gemini] Falha inesperada após esgotar as tentativas.')
}

export function cleanGeminiJson(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim()
}
