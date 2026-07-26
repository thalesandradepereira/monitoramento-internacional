import { ApiError, GoogleGenAI, type GenerateContentResponse } from '@google/genai'
import { config } from './config'

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const MIN_REQUEST_INTERVAL_MS = 4100

let client: GoogleGenAI | undefined

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

export function isRetryableGeminiError(error: unknown): boolean {
  const status = errorStatus(error)
  return status !== undefined && RETRYABLE_HTTP_STATUSES.has(status)
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
): Promise<GenerateContentResponse> {
  const gemini = getGeminiClient()
  const apiSchema = responseJsonSchema && typeof responseJsonSchema === 'object'
    ? Object.fromEntries(Object.entries(responseJsonSchema).filter(([key]) => key !== '$schema'))
    : responseJsonSchema

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      console.log(`[gemini] modelo=${model}; tentativa=${attempt}/${retries}; aguardando intervalo preventivo`)
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS))

      return await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: apiSchema,
        },
      })
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
