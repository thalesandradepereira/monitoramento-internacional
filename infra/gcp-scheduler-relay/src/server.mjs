import http from 'node:http'

const OWNER = process.env.GITHUB_OWNER || 'thalesandradepereira'
const RELAY_VERSION = '1.0.0'
const MAX_AGE_MS = 45 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000

const TARGETS = Object.freeze({
  '/dispatch/media': {
    target: 'media',
    repository: 'monitoramento-internacional',
    expectedJob: 'tap-monitoramento-media-failsafe',
  },
  '/dispatch/publisher': {
    target: 'publisher',
    repository: 'monitoramento-social-publisher',
    expectedJob: 'tap-instagram-publisher-failsafe',
  },
})

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export function validateSchedulerRequest({ method, path, headers, now = new Date() }) {
  if (method !== 'POST') {
    throw new Error('method_not_allowed')
  }

  const config = TARGETS[path]
  if (!config) {
    throw new Error('unknown_target')
  }

  if (String(header(headers, 'x-cloudscheduler')).toLowerCase() !== 'true') {
    throw new Error('missing_scheduler_header')
  }

  const jobName = String(header(headers, 'x-cloudscheduler-jobname') || '')
  const isExpectedJob =
    jobName === config.expectedJob
    || jobName.endsWith(`/jobs/${config.expectedJob}`)
  if (!isExpectedJob) {
    throw new Error('unexpected_scheduler_job')
  }

  const rawScheduleTime = String(header(headers, 'x-cloudscheduler-scheduletime') || '')
  const scheduleTime = new Date(rawScheduleTime)
  if (Number.isNaN(scheduleTime.getTime())) {
    throw new Error('invalid_schedule_time')
  }

  const ageMs = now.getTime() - scheduleTime.getTime()
  if (ageMs > MAX_AGE_MS) {
    throw new Error('stale_schedule_time')
  }
  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new Error('future_schedule_time')
  }

  return { ...config, jobName, scheduleTime: scheduleTime.toISOString() }
}

export async function dispatchToGitHub({
  config,
  githubToken,
  fetchImpl = fetch,
}) {
  if (!githubToken) {
    throw new Error('missing_github_token')
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${OWNER}/${config.repository}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tap-gcp-scheduler-relay/1.0',
      },
      body: JSON.stringify({
        event_type: 'gcp_scheduler',
        client_payload: {
          schema_version: 1,
          source: 'gcp-cloud-scheduler-relay',
          target: config.target,
          schedule_time: config.scheduleTime,
          scheduler_job:
            config.jobName === config.expectedJob
              ? `/jobs/${config.expectedJob}`
              : config.jobName,
          relay_version: RELAY_VERSION,
        },
      }),
    },
  )

  if (response.status !== 204) {
    const body = await response.text().catch(() => '')
    throw new Error(`github_dispatch_failed status=${response.status} body=${body.slice(0, 200)}`)
  }
}

export async function handleRelay({
  method,
  path,
  headers,
  githubToken,
  now = new Date(),
  fetchImpl = fetch,
}) {
  if (method === 'GET' && path === '/health') {
    return { status: 200, body: { ok: true, version: RELAY_VERSION } }
  }

  const config = validateSchedulerRequest({ method, path, headers, now })
  await dispatchToGitHub({ config, githubToken, fetchImpl })
  return {
    status: 202,
    body: {
      accepted: true,
      target: config.target,
      schedule_time: config.scheduleTime,
    },
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const result = await handleRelay({
      method: req.method || 'GET',
      path: url.pathname,
      headers: req.headers,
      githubToken: process.env.GITHUB_TOKEN || '',
    })
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(result.body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    const status =
      message === 'method_not_allowed' ? 405
        : message === 'unknown_target' ? 404
          : message === 'missing_github_token' ? 500
            : message.startsWith('github_dispatch_failed') ? 502
              : 400

    console.error('[relay]', message)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: message }))
  }
})

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 8080)
  server.listen(port, '0.0.0.0', () => {
    console.log(`[relay] listening on :${port}`)
  })
}
