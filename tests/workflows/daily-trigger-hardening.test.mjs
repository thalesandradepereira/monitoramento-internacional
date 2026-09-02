import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mainWorkflow = readFileSync(new URL('../../.github/workflows/monitoramento.yml', import.meta.url), 'utf8')
const watchdogWorkflow = readFileSync(new URL('../../.github/workflows/monitoramento-watchdog.yml', import.meta.url), 'utf8')
const gcpDeploy = readFileSync(new URL('../../infra/gcp-scheduler-relay/deploy.sh', import.meta.url), 'utf8')

test('daily trigger mesh provides four primary GitHub opportunities before watchdog window', () => {
  for (const cron of ['17 2 * * *', '47 2 * * *', '17 3 * * *', '47 3 * * *']) {
    assert.match(mainWorkflow, new RegExp(`cron: '${cron.replaceAll('*', '\\*')}'`))
  }
  assert.match(mainWorkflow, /timezone: 'America\/Sao_Paulo'/)
  assert.match(mainWorkflow, /repository_dispatch:\n    types: \[gcp_scheduler\]/)
})

test('independent watchdog provides six staggered recovery opportunities', () => {
  for (const cron of ['29 4 * * *', '59 4 * * *', '29 5 * * *', '59 5 * * *', '29 6 * * *', '59 6 * * *']) {
    assert.match(watchdogWorkflow, new RegExp(`cron: '${cron.replaceAll('*', '\\*')}'`))
  }
  assert.match(watchdogWorkflow, /timezone: 'America\/Sao_Paulo'/)
  assert.match(watchdogWorkflow, /^concurrency:\n  group: monitoramento-internacional-diario\n  cancel-in-progress: false/m)
})

test('external Google Cloud failsafe begins before the GitHub watchdog window ends and retries every 30 minutes', () => {
  const mediaStart = gcpDeploy.indexOf('  "$MEDIA_JOB"')
  const publisherStart = gcpDeploy.indexOf('  "$PUBLISHER_JOB"', mediaStart + 1)
  assert.ok(mediaStart > -1, 'MEDIA_JOB upsert block must exist')
  assert.ok(publisherStart > mediaStart, 'PUBLISHER_JOB block must follow MEDIA_JOB block')

  const mediaBlock = gcpDeploy.slice(mediaStart, publisherStart)
  assert.match(mediaBlock, /"11,41 3-6 \* \* \*"/)
  assert.match(mediaBlock, /"\/dispatch\/media"/)
  assert.match(gcpDeploy, /--time-zone=America\/Sao_Paulo/)
  assert.match(gcpDeploy, /--max-retry-attempts=3/)
})

test('all real GitHub execution paths share the same idempotence concurrency group', () => {
  const concurrency = /^concurrency:\n  group: monitoramento-internacional-diario\n  cancel-in-progress: false/m
  assert.match(mainWorkflow, concurrency)
  assert.match(watchdogWorkflow, concurrency)
})
