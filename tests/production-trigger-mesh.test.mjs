import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const deploy = fs.readFileSync('infra/gcp-scheduler-relay/deploy.sh', 'utf8')
const media = fs.readFileSync('.github/workflows/monitoramento.yml', 'utf8')
const watchdog = fs.readFileSync('.github/workflows/monitoramento-watchdog.yml', 'utf8')

test('external GCP media failsafe covers the full recovery window every 30 minutes', () => {
  assert.match(deploy, /upsert_job\s+"\$MEDIA_JOB"\s+"11,41 3-6 \* \* \*"/)
})

test('external GCP publisher failsafe covers the post-media window every 30 minutes', () => {
  assert.match(deploy, /upsert_job\s+"\$PUBLISHER_JOB"\s+"21,51 3-6 \* \* \*"/)
})

test('internal GitHub schedules remain independent and idempotent', () => {
  assert.match(media, /cron: '17 2 \* \* \*'/)
  assert.match(media, /cron: '17 3 \* \* \*'/)
  assert.match(watchdog, /cron: '29 4 \* \* \*'/)
  assert.match(watchdog, /cron: '29 5 \* \* \*'/)
  assert.match(watchdog, /cron: '29 6 \* \* \*'/)
})
