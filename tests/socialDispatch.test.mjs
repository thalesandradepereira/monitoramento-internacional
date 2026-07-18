import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardDescriptor,
  dispatchPrivatePublisher,
  selectLatestCompletedExecution,
  waitForPublishedDashboard,
} from '../scripts/dispatch-social-publisher.mjs'

test('selectLatestCompletedExecution escolhe a execução completed mais recente no fuso solicitado', () => {
  const selected = selectLatestCompletedExecution({
    version: 1,
    records: [
      { date: '2026-07-17', time: '03:00:00', timezone: 'America/Sao_Paulo', state: 'completed' },
      { date: '2026-07-18', time: '02:30:00', timezone: 'America/Sao_Paulo', state: 'failed' },
      { date: '2026-07-18', time: '02:20:00', timezone: 'America/Sao_Paulo', state: 'completed' },
      { date: '2026-07-19', time: '02:20:00', timezone: 'UTC', state: 'completed' },
    ],
  })

  assert.equal(selected.date, '2026-07-18')
  assert.equal(selected.state, 'completed')
})

test('dashboardDescriptor usa a data operacional recebida, sem somar dias', () => {
  const descriptor = dashboardDescriptor('2026-07-18', 'https://example.test/base/')

  assert.deepEqual(descriptor, {
    monitoringDate: '2026-07-18',
    displayDate: '18/07/2026',
    filename: 'Dashboard-Monitoramento-18-07-2026.html',
    dashboardUrl: 'https://example.test/base/Dashboard-Monitoramento-18-07-2026.html',
  })
})

test('waitForPublishedDashboard repete até receber HTML da data correta', async () => {
  let calls = 0
  let sleeps = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) {
      return new Response('not ready', { status: 404, headers: { 'content-type': 'text/plain' } })
    }
    return new Response(`<html><body>${'x'.repeat(600)}18/07/2026</body></html>`, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  const result = await waitForPublishedDashboard({
    dashboardUrl: 'https://example.test/dashboard.html',
    displayDate: '18/07/2026',
    maxAttempts: 2,
    retryDelayMs: 1,
    fetchImpl,
    sleepImpl: async () => { sleeps += 1 },
  })

  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.equal(sleeps, 1)
})

test('dispatchPrivatePublisher envia somente metadados, sem expor o token no corpo', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return new Response(null, { status: 204 })
  }

  await dispatchPrivatePublisher({
    repository: 'owner/private-publisher',
    token: 'secret-token',
    payload: { monitoring_date: '2026-07-18' },
    fetchImpl,
  })

  assert.equal(request.url, 'https://api.github.com/repos/owner/private-publisher/dispatches')
  assert.equal(request.options.headers.authorization, 'Bearer secret-token')
  assert.equal(request.options.body.includes('secret-token'), false)
  assert.deepEqual(JSON.parse(request.options.body), {
    event_type: 'dashboard_published',
    client_payload: { monitoring_date: '2026-07-18' },
  })
})
