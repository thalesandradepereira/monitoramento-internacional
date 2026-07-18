import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
const DEFAULT_PAGES_BASE_URL = 'https://thalesandradepereira.github.io/monitoramento-internacional'
const DEFAULT_MAX_ATTEMPTS = 12
const DEFAULT_RETRY_DELAY_MS = 10_000

export function selectLatestCompletedExecution(log, timezone = DEFAULT_TIMEZONE) {
  if (!log || log.version !== 1 || !Array.isArray(log.records)) {
    throw new Error('Registro state/daily-executions.json inválido.')
  }

  return log.records
    .filter(record => record?.state === 'completed' && record?.timezone === timezone)
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0]
}

export function dashboardDescriptor(dateIso, baseUrl = DEFAULT_PAGES_BASE_URL) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    throw new Error(`Data operacional inválida: ${dateIso}`)
  }

  const [year, month, day] = dateIso.split('-')
  const dateForFilename = `${day}-${month}-${year}`
  const displayDate = `${day}/${month}/${year}`
  const filename = `Dashboard-Monitoramento-${dateForFilename}.html`

  return {
    monitoringDate: dateIso,
    displayDate,
    filename,
    dashboardUrl: `${baseUrl.replace(/\/$/, '')}/${filename}`,
  }
}

export async function waitForPublishedDashboard({
  dashboardUrl,
  displayDate,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchImpl = fetch,
  sleepImpl = sleep,
}) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const separator = dashboardUrl.includes('?') ? '&' : '?'
      const response = await fetchImpl(`${dashboardUrl}${separator}publication_check=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'cache-control': 'no-cache',
          'user-agent': 'monitoramento-social-dispatch/1.0',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!contentType.toLowerCase().includes('text/html')) {
        throw new Error(`Content-Type inesperado: ${contentType || 'ausente'}`)
      }

      const html = await response.text()
      if (html.length < 500 || !html.includes(displayDate)) {
        throw new Error('Conteúdo publicado não corresponde ao dashboard esperado.')
      }

      return { attempts: attempt, contentLength: html.length }
    } catch (error) {
      lastError = error
      console.warn(`[social-dispatch] Dashboard ainda indisponível (tentativa ${attempt}/${maxAttempts}): ${error instanceof Error ? error.message : String(error)}`)
      if (attempt < maxAttempts) await sleepImpl(retryDelayMs)
    }
  }

  throw new Error(`Dashboard não ficou disponível após ${maxAttempts} tentativas: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export async function dispatchPrivatePublisher({
  repository,
  token,
  payload,
  fetchImpl = fetch,
  apiVersion = process.env.GITHUB_API_VERSION || '2026-03-10',
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('SOCIAL_PUBLISHER_REPOSITORY deve estar no formato owner/repository.')
  }

  const response = await fetchImpl(`https://api.github.com/repos/${repository}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'monitoramento-social-dispatch/1.0',
      'x-github-api-version': apiVersion,
    },
    body: JSON.stringify({
      event_type: 'dashboard_published',
      client_payload: payload,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Falha ao acionar ${repository}: HTTP ${response.status}; ${body.slice(0, 300)}`)
  }
}

async function main() {
  const repository = process.env.SOCIAL_PUBLISHER_REPOSITORY?.trim()
  const token = process.env.SOCIAL_PUBLISHER_TOKEN?.trim()

  if (!repository || !token) {
    console.log('[social-dispatch] Integração desativada: variável SOCIAL_PUBLISHER_REPOSITORY ou segredo SOCIAL_PUBLISHER_TOKEN não configurado.')
    return
  }

  const timezone = process.env.TIMEZONE || DEFAULT_TIMEZONE
  const pagesBaseUrl = process.env.GITHUB_PAGES_BASE_URL || DEFAULT_PAGES_BASE_URL
  const logPath = path.resolve(process.cwd(), process.env.DAILY_EXECUTION_LOG_PATH || 'state/daily-executions.json')

  if (!fs.existsSync(logPath)) {
    throw new Error(`Registro de execução não encontrado: ${logPath}`)
  }

  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'))
  const execution = selectLatestCompletedExecution(log, timezone)
  if (!execution) {
    throw new Error(`Nenhuma execução completed encontrada para o fuso ${timezone}.`)
  }

  const dashboard = dashboardDescriptor(execution.date, pagesBaseUrl)
  const localDashboardPath = path.resolve(process.cwd(), 'docs', dashboard.filename)
  if (!fs.existsSync(localDashboardPath)) {
    throw new Error(`Arquivo do dashboard não encontrado no checkout: ${localDashboardPath}`)
  }

  console.log(`[social-dispatch] Validando publicação de ${dashboard.dashboardUrl}`)
  const availability = await waitForPublishedDashboard(dashboard)

  const payload = {
    schema_version: 1,
    monitoring_date: dashboard.monitoringDate,
    display_date: dashboard.displayDate,
    dashboard_url: dashboard.dashboardUrl,
    dashboard_filename: dashboard.filename,
    timezone,
    source_repository: process.env.GITHUB_REPOSITORY || 'thalesandradepereira/monitoramento-internacional',
    source_sha: process.env.GITHUB_SHA || '',
    validated_at: new Date().toISOString(),
  }

  await dispatchPrivatePublisher({ repository, token, payload })
  console.log(`[social-dispatch] Evento dashboard_published enviado para ${repository}; tentativas de validação=${availability.attempts}.`)
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isDirectExecution) {
  main().catch(error => {
    console.error('[social-dispatch] Erro fatal:', error)
    process.exitCode = 1
  })
}
