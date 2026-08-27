import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../../.github/workflows/verify-recipients-d1.yml', import.meta.url), 'utf8')

test('temporary D1 verification workflow is manually dispatched and isolated', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m)
  assert.match(workflow, /^concurrency:\n  group: temporary-verify-recipients-d1\n  cancel-in-progress: false/m)
  assert.match(workflow, /node-version: '22'/)
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/)
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/)
  assert.doesNotMatch(workflow, /actions\/checkout@v4|actions\/setup-node@v4/)
  assert.doesNotMatch(workflow, /GEMINI|SMTP|npm run once|wrangler|d1 .*apply|send/i)
})

test('temporary D1 verification workflow performs one authenticated GET without leaking sensitive data', () => {
  assert.match(workflow, /RECIPIENTS_API_TOKEN: \$\{\{ secrets\.RECIPIENTS_API_TOKEN \}\}/)
  assert.equal((workflow.match(/--request GET/g) || []).length, 1)
  assert.equal((workflow.match(/curl /g) || []).length, 1)
  assert.doesNotMatch(workflow, /--request POST|--data|--data-binary|--upload-file/i)
  assert.doesNotMatch(workflow, /cat "?\$response_file|echo .*RECIPIENTS_API_TOKEN|console\.log\([^\n]*(body|recipients\[|recipients\.|JSON\.stringify)/i)
})

test('temporary D1 verification validates JSON and accepts an optional expected count', () => {
  assert.match(workflow, /expected_active_recipients:/)
  assert.match(workflow, /default: 0/)
  assert.match(workflow, /EXPECTED_ACTIVE_RECIPIENTS: \$\{\{ inputs\.expected_active_recipients \}\}/)
  assert.match(workflow, /status !== '200'/)
  assert.match(workflow, /Content-Type is not JSON/)
  assert.match(workflow, /JSON is invalid|response JSON is invalid/)
  assert.match(workflow, /activeCount === 0/)
  assert.match(workflow, /expected > 0 && activeCount !== expected/)
  assert.doesNotMatch(workflow, /EXPECTED_ACTIVE_RECIPIENTS: '4'/)
  assert.match(workflow, /Active recipients received: \$\{activeCount\}/)
})
