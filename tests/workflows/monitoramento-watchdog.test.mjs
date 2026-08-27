import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../../.github/workflows/monitoramento-watchdog.yml', import.meta.url), 'utf8')

test('watchdog has three independent recovery schedules and shared idempotence concurrency', () => {
  assert.match(workflow, /cron: '29 4 \* \* \*'/)
  assert.match(workflow, /cron: '29 5 \* \* \*'/)
  assert.match(workflow, /cron: '29 6 \* \* \*'/)
  assert.match(workflow, /timezone: 'America\/Sao_Paulo'/)
  assert.match(workflow, /^concurrency:\n  group: monitoramento-internacional-diario\n  cancel-in-progress: false/m)
})

test('watchdog manual mode defaults to dry run and push mode never executes the real pipeline', () => {
  assert.match(workflow, /default: true/)
  assert.match(workflow, /if: github\.event_name == 'push'/)
  assert.match(workflow, /if: github\.event_name != 'push'/)
  assert.match(workflow, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true && 'true' \|\| 'false' \}\}/)
  assert.match(workflow, /sem publicar dashboard e sem enviar e-mail/)
})

test('watchdog preserves production recipients source and social publishing gate', () => {
  assert.match(workflow, /RECIPIENTS_SOURCE: 'd1'/)
  assert.match(workflow, /RECIPIENTS_API_TOKEN: \$\{\{ secrets\.RECIPIENTS_API_TOKEN \}\}/)
  assert.match(workflow, /dashboard_created: \$\{\{ steps\.monitor\.outputs\.dashboard_created \}\}/)
  assert.match(workflow, /if: \$\{\{ needs\.rodar-monitoramento\.outputs\.dashboard_created == 'true' \}\}/)
})

test('watchdog uses pinned actions and Node 22', () => {
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  assert.match(workflow, /node-version: '22'/)
  assert.doesNotMatch(workflow, /actions\/checkout@v4|actions\/setup-node@v4|node-version: '20'/)
})
