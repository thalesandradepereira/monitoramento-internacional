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
  assert.match(workflow, /cron: '0 5 \* \* \*'/)
  assert.match(workflow, /CRON_EXPR: '0 2 \* \* \*'/)
  assert.match(workflow, /TIMEZONE: 'America\/Sao_Paulo'/)
  assert.match(workflow, /DAILY_EXECUTION_LOG_PATH: 'state\/daily-executions\.json'/)
  assert.match(workflow, /^concurrency:\n  group: monitoramento-internacional-diario\n  cancel-in-progress: false/m)
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
