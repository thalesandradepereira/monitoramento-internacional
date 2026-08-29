import fs from 'node:fs'

const TIMEZONE = 'America/Sao_Paulo'
const MARKER_PATH = 'ops/recover-media.txt'
const EXPECTED_REASON = 'external-controller-recovery'

function localDate(date, timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function parseRecoveryMarker(text) {
  const values = {}
  for (const line of String(text || '').split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) throw new Error(`Linha inválida no marcador: ${trimmed}`)
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return values
}

export function validateRecoveryMarker(text, now = new Date()) {
  const marker = parseRecoveryMarker(text)
  if (marker.schema_version !== '1') throw new Error('schema_version inválido')
  if (marker.reason !== EXPECTED_REASON) throw new Error('reason inválido')
  if (marker.date !== localDate(now)) {
    throw new Error(`marcador não pertence à data atual de Brasília: ${marker.date || 'ausente'}`)
  }
  if (!marker.requested_at) throw new Error('requested_at ausente')
  const requestedAt = new Date(marker.requested_at)
  if (Number.isNaN(requestedAt.getTime())) throw new Error('requested_at inválido')
  const ageMs = now.getTime() - requestedAt.getTime()
  if (ageMs > 30 * 60 * 1000) throw new Error('marcador de recuperação está expirado')
  if (ageMs < -5 * 60 * 1000) throw new Error('marcador de recuperação está no futuro')
  return marker
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = fs.readFileSync(MARKER_PATH, 'utf8')
  const marker = validateRecoveryMarker(text)
  console.log(`[recovery] marcador aceito date=${marker.date} requested_at=${marker.requested_at}`)
}
