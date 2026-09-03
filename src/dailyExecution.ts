import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { config } from './config'

export type ExecutionMode = 'scheduled' | 'manual' | 'local'
export type ExecutionState = 'in_progress' | 'completed' | 'failed' | 'dry_run'

export interface DailyExecutionRecord {
  date: string
  time: string
  timezone: string
  state: ExecutionState
  mode: ExecutionMode
  attempted: number
  sent: number
  failed: number
}

interface DailyExecutionLog {
  version: 1
  records: DailyExecutionRecord[]
}

const logPath = path.resolve(__dirname, '..', config.dailyExecutionLogPath)
const STALE_IN_PROGRESS_AFTER_MS = 45 * 60 * 1000

export function getZonedNow(timezone = config.timezone, now = new Date()): { date: string; time: string; timezone: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    timezone,
  }
}

function emptyLog(): DailyExecutionLog {
  return { version: 1, records: [] }
}

export function readDailyExecutionLog(): DailyExecutionLog {
  if (!fs.existsSync(logPath)) return emptyLog()
  const raw = fs.readFileSync(logPath, 'utf8')
  if (!raw.trim()) return emptyLog()
  const parsed = JSON.parse(raw) as DailyExecutionLog
  if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
    throw new Error(`Registro persistente inválido em ${config.dailyExecutionLogPath}`)
  }
  return parsed
}

function writeDailyExecutionLog(log: DailyExecutionLog): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.writeFileSync(logPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8')
}

function runGit(command: string): void {
  execSync(command, { stdio: 'pipe' })
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = err as {
      message?: unknown
      stderr?: unknown
      stdout?: unknown
    }
    const parts = [candidate.message, candidate.stderr, candidate.stdout]
      .filter(value => value !== undefined && value !== null)
      .map(value => Buffer.isBuffer(value) ? value.toString('utf8') : String(value))
      .map(value => value.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts.join('\n')
  }
  return String(err)
}

export function isConcurrentPushRejection(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase()
  return message.includes('non-fast-forward')
    || message.includes('fetch first')
}

function pushWithConcurrentUpdateRecovery(maxAttempts = 4): void {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      runGit('git push origin HEAD:main')
      return
    } catch (err) {
      lastError = err
      if (!isConcurrentPushRejection(err) || attempt === maxAttempts) throw err
      console.warn(`[idempotencia] Push concorrente detectado; sincronizando main e tentando novamente (${attempt}/${maxAttempts}).`)
      try {
        runGit('git pull --rebase origin main')
      } catch (rebaseErr) {
        try { runGit('git rebase --abort') } catch {}
        throw new Error(`[idempotencia] Falha ao rebasear após atualização concorrente: ${errorMessage(rebaseErr)}`)
      }
    }
  }
  throw lastError
}

export function syncPersistentExecutionLog(): void {
  if (!process.env.GITHUB_ACTIONS || process.env.DRY_RUN === 'true') return
  try {
    runGit('git pull --rebase origin main')
  } catch (err: any) {
    throw new Error(`[idempotencia] Falha ao sincronizar registro persistente antes do envio: ${err?.message || err}`)
  }
}

function getEffectiveRealRecord(date: string): DailyExecutionRecord | undefined {
  return readDailyExecutionLog().records
    .filter(record => record.date === date && record.timezone === config.timezone && record.state !== 'dry_run')
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0]
}

function wallClockAgeMs(record: DailyExecutionRecord, now: Date): number {
  const zonedNow = getZonedNow(record.timezone, now)
  const recordWallClock = Date.parse(`${record.date}T${record.time}Z`)
  const nowWallClock = Date.parse(`${zonedNow.date}T${zonedNow.time}Z`)
  if (!Number.isFinite(recordWallClock) || !Number.isFinite(nowWallClock)) return Number.NaN
  return nowWallClock - recordWallClock
}

function canRecoverStaleInProgress(record: DailyExecutionRecord, now: Date): boolean {
  if (record.state !== 'in_progress') return false
  if (record.attempted !== 0 || record.sent !== 0 || record.failed !== 0) return false
  const ageMs = wallClockAgeMs(record, now)
  return Number.isFinite(ageMs) && ageMs >= STALE_IN_PROGRESS_AFTER_MS
}

export function assertCanStartRealExecution(date: string, now = new Date()): void {
  const sameDay = getEffectiveRealRecord(date)
  if (!sameDay) return

  if (sameDay.state === 'completed') {
    throw new AlreadyCompletedExecutionError(`[idempotencia] Envio real de ${date} (${config.timezone}) já registrado como concluído. Encerrando sem novo envio.`)
  }

  if (sameDay.state === 'failed') {
    if (sameDay.sent === 0 && sameDay.attempted === sameDay.failed) {
      console.warn(
        `[idempotencia] Falha anterior de ${date} não teve nenhuma entrega aceita `
        + `(${sameDay.attempted} tentativa(s), ${sameDay.failed} falha(s)); nova tentativa real permitida.`,
      )
      return
    }
    throw new Error(`[idempotencia] Envio real de ${date} (${config.timezone}) já registrado com falha. Reenvio automático bloqueado para evitar duplicidade.`)
  }

  if (canRecoverStaleInProgress(sameDay, now)) {
    console.warn(
      `[idempotencia] Execução in_progress de ${date} está stale há mais de 45 minutos e não registrou `
      + 'qualquer tentativa/entrega; recovery seguro permitido.',
    )
    return
  }

  throw new Error(`[idempotencia] Existe execução real em andamento para ${date} (${config.timezone}). Estado incerto; envio bloqueado.`)
}

export class AlreadyCompletedExecutionError extends Error {}

export function persistExecutionRecord(record: DailyExecutionRecord): void {
  const log = readDailyExecutionLog()
  const filtered = log.records.filter(existing => !(
    existing.date === record.date && existing.timezone === record.timezone
  ))
  filtered.push(record)
  filtered.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  writeDailyExecutionLog({ version: 1, records: filtered })
}

export function commitAndPushPersistentState(message: string): void {
  if (!process.env.GITHUB_ACTIONS || process.env.DRY_RUN === 'true') return
  try {
    if (process.env.GITHUB_ACTIONS) {
      runGit('git config user.name "github-actions[bot]"')
      runGit('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"')
    }
    runGit(`git add ${config.dailyExecutionLogPath} docs/`)
    if (fs.existsSync(path.resolve(__dirname, '..', 'state'))) runGit('git add state/')
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (!status.trim()) return
    runGit(`git commit -m ${JSON.stringify(message)}`)
    pushWithConcurrentUpdateRecovery()
  } catch (err: any) {
    throw new Error(`[idempotencia] Falha ao persistir/sincronizar estado obrigatório: ${err?.message || err}`)
  }
}
