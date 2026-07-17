import fs from 'fs'
import path from 'path'
import { config } from './config'

export type RecipientsSource = 'github' | 'd1'

export interface RecipientLoadResult {
  source: RecipientsSource
  recipients: string[]
}

export const DEFAULT_RECIPIENTS_API_URL = 'https://monitoramento-internacional-unsub.thalesandrade.workers.dev/internal/recipients'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function maskEmail(email: string): string {
  const [local, domain = ''] = email.split('@')
  const visibleLocal = local.slice(0, 2)
  const domainParts = domain.split('.')
  const domainSuffix = domainParts.length > 1 ? domainParts.slice(1).join('.') : domain
  return `${visibleLocal}${'*'.repeat(Math.max(local.length - 2, 3))}@***${domainSuffix ? `.${domainSuffix}` : ''}`
}

export function normalizeAndValidateRecipients(input: unknown, maxRecipients = config.recipients.maxRecipients, allowEmpty = false): string[] {
  if (!Array.isArray(input)) {
    throw new Error('[recipients] Estrutura inválida: lista de destinatários ausente.')
  }

  const recipients: string[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string') {
      throw new Error('[recipients] Estrutura inválida: destinatário não textual.')
    }
    const normalized = item.trim().toLowerCase()
    if (!normalized || !EMAIL_RE.test(normalized)) {
      throw new Error('[recipients] Lista inválida: destinatário inválido encontrado.')
    }
    if (!seen.has(normalized)) {
      seen.add(normalized)
      recipients.push(normalized)
    }
    if (recipients.length > maxRecipients) {
      throw new Error(`[recipients] Lista excessiva: limite=${maxRecipients}.`)
    }
  }

  if (!recipients.length && !allowEmpty) {
    throw new Error('[recipients] Lista vazia não permitida.')
  }
  return recipients
}

export async function loadRecipients(): Promise<RecipientLoadResult> {
  if (config.recipients.source === 'github') {
    return { source: 'github', recipients: loadGithubRecipients() }
  }
  if (config.recipients.source === 'd1') {
    return { source: 'd1', recipients: await loadD1Recipients() }
  }
  throw new Error('[recipients] RECIPIENTS_SOURCE inválido. Use github ou d1.')
}

function loadGithubRecipients(): string[] {
  const envEmails = config.destEmail.split(',').map(e => e.trim()).filter(Boolean)
  let txtEmails: string[] = []
  try {
    const file = path.resolve(__dirname, '..', 'recipients.txt')
    if (fs.existsSync(file)) {
      txtEmails = fs.readFileSync(file, 'utf8')
        .split('\n')
        .map(e => e.trim())
        .filter(e => e && !e.startsWith('#'))
    }
  } catch (err: any) {
    console.warn(`[recipients] Erro ao ler arquivo legado; fonte=github; detalhe=${err?.message || 'erro desconhecido'}`)
  }

  return normalizeAndValidateRecipients([...envEmails, ...txtEmails], config.recipients.maxRecipients, true)
}

async function loadD1Recipients(): Promise<string[]> {
  const url = new URL(config.recipients.apiUrl)
  if (url.protocol !== 'https:') {
    throw new Error('[recipients] RECIPIENTS_API_URL deve usar HTTPS.')
  }
  if (!config.recipients.apiToken) {
    throw new Error('[recipients] RECIPIENTS_API_TOKEN obrigatório para RECIPIENTS_SOURCE=d1.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.recipients.timeoutMs)
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.recipients.apiToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`[recipients] API privada retornou HTTP ${response.status}; fonte=d1.`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('[recipients] API privada retornou Content-Type inválido; fonte=d1.')
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`[recipients] Timeout ao consultar API privada; fonte=d1; timeoutMs=${config.recipients.timeoutMs}.`)
      }
      throw new Error('[recipients] API privada retornou JSON inválido; fonte=d1.')
    }

    const list = Array.isArray(body) ? body : (body && typeof body === 'object' ? (body as { recipients?: unknown }).recipients : undefined)
    return normalizeAndValidateRecipients(list, config.recipients.maxRecipients)
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`[recipients] Timeout ao consultar API privada; fonte=d1; timeoutMs=${config.recipients.timeoutMs}.`)
    }
    if (err instanceof Error && err.message.startsWith('[recipients]')) {
      throw err
    }
    throw new Error('[recipients] Falha ao consultar API privada; fonte=d1.')
  } finally {
    clearTimeout(timeout)
  }
}
