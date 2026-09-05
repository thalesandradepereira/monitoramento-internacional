import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const deploy = fs.readFileSync('infra/gcp-scheduler-relay/deploy.sh', 'utf8')
const media = fs.readFileSync('.github/workflows/monitoramento.yml', 'utf8')
const watchdog = fs.readFileSync('.github/workflows/monitoramento-watchdog.yml', 'utf8')

function blockStartingAt(text, marker) {
  const start = text.indexOf(marker)
  assert.notEqual(start, -1, `marker not found: ${marker}`)
  const next = text.indexOf('\n\n', start)
  return text.slice(start, next === -1 ? undefined : next)
}

test('external GCP media failsafe covers the full recovery window every 30 minutes', () => {
  const block = blockStartingAt(deploy, 'upsert_job \\\n  "$MEDIA_JOB"')
  assert.match(block, /"11,41 3-6 \* \* \*"/)
  assert.match(block, /"\/dispatch\/media"/)
})

test('external GCP publisher failsafe covers the post-media window every 30 minutes', () => {
  const block = blockStartingAt(deploy, 'upsert_job \\\n  "$PUBLISHER_JOB"')
  assert.match(block, /"21,51 3-6 \* \* \*"/)
  assert.match(block, /"\/dispatch\/publisher"/)
})

test('external jobs retain Sao Paulo timezone, OIDC and bounded retries', () => {
  assert.match(deploy, /--time-zone=America\/Sao_Paulo/)
  assert.match(deploy, /--oidc-service-account-email=\$INVOKER_SA/)
  assert.match(deploy, /--max-retry-attempts=3/)
})

test('internal GitHub schedules remain independent and idempotent', () => {
  assert.match(media, /cron: '17 2 \* \* \*'/)
  assert.match(media, /cron: '17 3 \* \* \*'/)
  assert.match(watchdog, /cron: '29 4 \* \* \*'/)
  assert.match(watchdog, /cron: '29 5 \* \* \*'/)
  assert.match(watchdog, /cron: '29 6 \* \* \*'/)
})
