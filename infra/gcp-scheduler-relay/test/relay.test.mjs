import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NODE_ENV = 'test'
const { handleRelay, validateSchedulerRequest } = await import('../src/server.mjs')

const now = new Date('2026-08-27T10:00:00.000Z')

function headers(target = 'media') {
  const job =
    target === 'media'
      ? 'tap-monitoramento-media-failsafe'
      : 'tap-instagram-publisher-failsafe'
  return {
    'x-cloudscheduler': 'true',
    'x-cloudscheduler-jobname':
      `projects/tap-monitoramento-auto/locations/us-central1/jobs/${job}`,
    'x-cloudscheduler-scheduletime': '2026-08-27T09:51:00.000Z',
  }
}

test('health endpoint is side-effect free', async () => {
  const result = await handleRelay({
    method: 'GET',
    path: '/health',
    headers: {},
    githubToken: '',
    now,
    fetchImpl: async () => {
      throw new Error('must not call GitHub')
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
})

test('media scheduler request dispatches only to monitoramento-internacional', async () => {
  let captured
  const result = await handleRelay({
    method: 'POST',
    path: '/dispatch/media',
    headers: headers('media'),
    githubToken: 'test-token',
    now,
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return { status: 204, text: async () => '' }
    },
  })

  assert.equal(result.status, 202)
  assert.match(captured.url, /monitoramento-internacional\/dispatches$/)
  const body = JSON.parse(captured.options.body)
  assert.equal(body.event_type, 'gcp_scheduler')
  assert.equal(body.client_payload.target, 'media')
  assert.equal(body.client_payload.source, 'gcp-cloud-scheduler-relay')
})

test('accepts Cloud Scheduler bare job-name header as documented', () => {
  const bareHeaders = {
    ...headers('media'),
    'x-cloudscheduler-jobname': 'tap-monitoramento-media-failsafe',
  }

  const result = validateSchedulerRequest({
    method: 'POST',
    path: '/dispatch/media',
    headers: bareHeaders,
    now,
  })

  assert.equal(result.expectedJob, 'tap-monitoramento-media-failsafe')
  assert.equal(result.jobName, 'tap-monitoramento-media-failsafe')
})

test('publisher scheduler request dispatches only to the private publisher', async () => {
  let captured
  await handleRelay({
    method: 'POST',
    path: '/dispatch/publisher',
    headers: headers('publisher'),
    githubToken: 'test-token',
    now,
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return { status: 204, text: async () => '' }
    },
  })
  assert.match(captured.url, /monitoramento-social-publisher\/dispatches$/)
  assert.equal(JSON.parse(captured.options.body).client_payload.target, 'publisher')
})

test('normalizes a force-run future nominal schedule time without weakening stale rejection', async () => {
  let captured
  const forceNow = new Date('2026-08-29T14:20:00.000Z')
  const forceHeaders = {
    ...headers('media'),
    'x-cloudscheduler-jobname': 'tap-monitoramento-media-failsafe',
    'x-cloudscheduler-scheduletime': '2026-08-30T09:41:00.000Z',
  }

  const result = await handleRelay({
    method: 'POST',
    path: '/dispatch/media',
    headers: forceHeaders,
    githubToken: 'test-token',
    now: forceNow,
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return { status: 204, text: async () => '' }
    },
  })

  assert.equal(result.status, 202)
  const body = JSON.parse(captured.options.body)
  assert.equal(body.client_payload.schedule_time, forceNow.toISOString())
  assert.equal(body.client_payload.original_schedule_time, '2026-08-30T09:41:00.000Z')
  assert.equal(body.client_payload.schedule_time_mode, 'force-run-normalized')
})

test('rejects forged, stale and mismatched scheduler requests', () => {
  assert.throws(
    () =>
      validateSchedulerRequest({
        method: 'POST',
        path: '/dispatch/media',
        headers: { ...headers('media'), 'x-cloudscheduler': 'false' },
        now,
      }),
    /scheduler_header/,
  )

  assert.throws(
    () =>
      validateSchedulerRequest({
        method: 'POST',
        path: '/dispatch/media',
        headers: {
          ...headers('media'),
          'x-cloudscheduler-jobname':
            'projects/x/locations/us-central1/jobs/tap-instagram-publisher-failsafe',
        },
        now,
      }),
    /scheduler_job/,
  )

  assert.throws(
    () =>
      validateSchedulerRequest({
        method: 'POST',
        path: '/dispatch/media',
        headers: {
          ...headers('media'),
          'x-cloudscheduler-scheduletime': '2026-08-27T08:00:00Z',
        },
        now,
      }),
    /stale/,
  )
})
