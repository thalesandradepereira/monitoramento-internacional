import fs from 'node:fs'

const TIMEZONE = 'America/Sao_Paulo'
const EXPECTED_SOURCE = 'gcp-cloud-scheduler-relay'
const EXPECTED_TARGET = 'media'
const EXPECTED_JOB_SUFFIX = '/jobs/tap-monitoramento-media-failsafe'
const MAX_AGE_MS = 45 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

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

export function validateGcpSchedulerDispatch(event, now = new Date()) {
  if (!event || typeof event !== 'object') {
    throw new Error('GitHub event payload must be an object.')
  }
  if (event.action !== 'gcp_scheduler') {
    throw new Error(`Unexpected repository_dispatch action: ${String(event.action || 'missing')}`)
  }

  const payload = event.client_payload
  if (!payload || typeof payload !== 'object') {
    throw new Error('repository_dispatch client_payload is missing.')
  }
  if (payload.schema_version !== 1) {
    throw new Error('Unsupported GCP scheduler payload schema_version.')
  }
  if (payload.source !== EXPECTED_SOURCE) {
    throw new Error('Unexpected scheduler dispatch source.')
  }
  if (payload.target !== EXPECTED_TARGET) {
    throw new Error('Unexpected scheduler dispatch target.')
  }

  const schedulerJob = String(payload.scheduler_job || '')
  if (!schedulerJob.endsWith(EXPECTED_JOB_SUFFIX)) {
    throw new Error('Unexpected Cloud Scheduler job name.')
  }

  const scheduleTime = new Date(String(payload.schedule_time || ''))
  if (Number.isNaN(scheduleTime.getTime())) {
    throw new Error('Invalid Cloud Scheduler schedule_time.')
  }

  const ageMs = now.getTime() - scheduleTime.getTime()
  if (ageMs > MAX_AGE_MS) {
    throw new Error('Cloud Scheduler dispatch is stale.')
  }
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new Error('Cloud Scheduler dispatch is future-dated.')
  }
  if (localDate(scheduleTime) !== localDate(now)) {
    throw new Error('Cloud Scheduler dispatch is not for the current Brasília date.')
  }

  return {
    target: EXPECTED_TARGET,
    scheduleTime: scheduleTime.toISOString(),
    schedulerJob,
  }
}

function appendSummary(result) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  fs.appendFileSync(
    summaryPath,
    [
      '## Google Cloud Scheduler failsafe',
      `- Target: \`${result.target}\``,
      `- Schedule time: \`${result.scheduleTime}\``,
      `- Scheduler job: \`${result.schedulerJob}\``,
      '- Decision: **accepted**',
      '',
    ].join('\n'),
    'utf8',
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.GITHUB_EVENT_NAME !== 'repository_dispatch') {
    throw new Error('GCP dispatch guard only runs for repository_dispatch.')
  }
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH is required.')
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
  const result = validateGcpSchedulerDispatch(event)
  appendSummary(result)
  console.log(
    `[gcp-scheduler] accepted target=${result.target} schedule_time=${result.scheduleTime}`,
  )
}
