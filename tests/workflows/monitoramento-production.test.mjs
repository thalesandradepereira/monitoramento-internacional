import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../../.github/workflows/monitoramento.yml', import.meta.url), 'utf8')

test('production workflow uses D1 as the recipients source', () => {
  assert.match(workflow, /RECIPIENTS_SOURCE: 'd1'/)
  assert.doesNotMatch(workflow, /RECIPIENTS_SOURCE: 'github'/)
  assert.match(workflow, /RECIPIENTS_API_URL: 'https:\/\/monitoramento-internacional-unsub\.thalesandrade\.workers\.dev\/internal\/recipients'/)
  assert.match(workflow, /RECIPIENTS_API_TOKEN: \$\{\{ secrets\.RECIPIENTS_API_TOKEN \}\}/)
})

test('production workflow keeps safe scheduling, dry-run dispatch, and daily idempotence controls', () => {
  assert.match(workflow, /default: true/)
  assert.match(workflow, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run == true && 'true' \|\| 'false' \}\}/)
  assert.match(workflow, /cron: '17 2 \* \* \*'/)
  assert.match(workflow, /timezone: 'America\/Sao_Paulo'/)
  assert.match(workflow, /CRON_EXPR: '0 2 \* \* \*'/)
  assert.match(workflow, /TIMEZONE: 'America\/Sao_Paulo'/)
  assert.match(workflow, /DAILY_EXECUTION_LOG_PATH: 'state\/daily-executions\.json'/)
  assert.match(workflow, /^concurrency:\n  group: monitoramento-internacional-diario\n  cancel-in-progress: false/m)
  assert.match(workflow, /run: npm ci/)
  assert.doesNotMatch(workflow, /npm ci \|\| npm install/)
})

test('production workflow uses Gemini 3.6 for editorial synthesis and economical models for bulk stages', () => {
  assert.match(workflow, /GEMINI_MODEL_TRIAGE: 'gemini-3\.5-flash-lite'/)
  assert.match(workflow, /GEMINI_MODEL_SUMMARY: 'gemini-3\.6-flash'/)
  assert.match(workflow, /GEMINI_MODEL_TRANSLATION: 'gemini-3\.5-flash-lite'/)
  assert.match(workflow, /GEMINI_TIMEOUT_MS: '120000'/)
  assert.doesNotMatch(workflow, /GEMINI_MODEL: 'gemini-2\.5-flash'/)
})

test('social publication is gated by a dashboard created in the current run', () => {
  assert.match(workflow, /dashboard_created: \$\{\{ steps\.monitor\.outputs\.dashboard_created \}\}/)
  assert.match(workflow, /id: monitor/)
  assert.match(workflow, /if: \$\{\{ needs\.rodar-monitoramento\.outputs\.dashboard_created == 'true' \}\}/)
  assert.match(workflow, /EXPECTED_MONITORING_DATE: \$\{\{ needs\.rodar-monitoramento\.outputs\.monitoring_date \}\}/)
  assert.match(workflow, /EXPECTED_DASHBOARD_FILENAME: \$\{\{ needs\.rodar-monitoramento\.outputs\.dashboard_filename \}\}/)
})

test('production workflow has no automatic GitHub or DEST_EMAIL fallback when D1 is configured', () => {
  const sourceIndex = workflow.indexOf("RECIPIENTS_SOURCE: 'd1'")
  const tokenIndex = workflow.indexOf('RECIPIENTS_API_TOKEN: ${{ secrets.RECIPIENTS_API_TOKEN }}')
  assert.ok(sourceIndex > -1)
  assert.ok(tokenIndex > sourceIndex)
  const recipientsBlock = workflow.slice(sourceIndex, tokenIndex + 'RECIPIENTS_API_TOKEN: ${{ secrets.RECIPIENTS_API_TOKEN }}'.length)
  assert.doesNotMatch(recipientsBlock, /DEST_EMAIL|recipients\.txt|github/i)
  assert.doesNotMatch(workflow, /RECIPIENTS_API_TOKEN: (?!\$\{\{ secrets\.RECIPIENTS_API_TOKEN \}\})/)
})
