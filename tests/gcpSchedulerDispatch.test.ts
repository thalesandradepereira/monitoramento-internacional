import assert from 'node:assert/strict'
import test from 'node:test'

import { validateGcpSchedulerDispatch } from '../scripts/validate-gcp-scheduler-dispatch.mjs'

const now = new Date('2026-08-27T10:00:00.000Z')

function validEvent(overrides = {}) {
  return {
    action: 'gcp_scheduler',
    client_payload: {
      schema_version: 1,
      source: 'gcp-cloud-scheduler-relay',
      target: 'media',
      schedule_time: '2026-08-27T09:51:00.000Z',
      scheduler_job:
        'projects/tap-monitoramento-auto/locations/us-central1/jobs/tap-monitoramento-media-failsafe',
      relay_version: '1.0.0',
      ...overrides,
    },
  }
}

test('accepts the current-day Cloud Scheduler media dispatch', () => {
  const result = validateGcpSchedulerDispatch(validEvent(), now)
  assert.equal(result.target, 'media')
  assert.equal(result.scheduleTime, '2026-08-27T09:51:00.000Z')
})

test('rejects a stale Cloud Scheduler dispatch', () => {
  assert.throws(
    () =>
      validateGcpSchedulerDispatch(
        validEvent({ schedule_time: '2026-08-27T08:00:00.000Z' }),
        now,
      ),
    /stale/,
  )
})

test('rejects an unauthorized relay source', () => {
  assert.throws(
    () => validateGcpSchedulerDispatch(validEvent({ source: 'other-relay' }), now),
    /source/,
  )
})

test('rejects the wrong scheduler job or target', () => {
  assert.throws(
    () =>
      validateGcpSchedulerDispatch(
        validEvent({
          scheduler_job:
            'projects/tap-monitoramento-auto/locations/us-central1/jobs/other-job',
        }),
        now,
      ),
    /job name/,
  )
  assert.throws(
    () => validateGcpSchedulerDispatch(validEvent({ target: 'publisher' }), now),
    /target/,
  )
})
