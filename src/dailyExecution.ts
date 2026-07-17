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

export function getZonedNow(timezone = config.timezone): { date: string; time: string; timezone: string } {
  const now = new Date()
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

export function assertCanStartRealExecution(date: string): void {
  const sameDay = getEffectiveRealRecord(date)
  if (!sameDay) return

  if (sameDay.state === 'completed') {
    throw new AlreadyCompletedExecutionError(`[idempotencia] Envio real de ${date} (${config.timezone}) já registrado como concluído. Encerrando sem novo envio.`)
  }

  if (sameDay.state === 'failed') {
    throw new Error(`[idempotencia] Envio real de ${date} (${config.timezone}) já registrado com falha. Reenvio automático bloqueado para evitar duplicidade.`)
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
    runGit('git push origin HEAD:main')
  } catch (err: any) {
    throw new Error(`[idempotencia] Falha ao persistir/sincronizar estado obrigatório: ${err?.message || err}`)
  }
}
