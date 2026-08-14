import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const analyticsPath = path.join(process.cwd(), 'docs', 'analytics.html')
const analyticsHtml = fs.readFileSync(analyticsPath, 'utf8')

test('analytics consulta o Abacus em lotes com pausa entre janelas', () => {
  assert.match(analyticsHtml, /var BATCH_SIZE = 20/)
  assert.match(analyticsHtml, /var WINDOW_DELAY_MS = 3200/)
  assert.match(analyticsHtml, /await sleep\(WINDOW_DELAY_MS\)/)
})

test('analytics retenta rate limit e falhas transitórias', () => {
  assert.match(analyticsHtml, /resp\.status === 429/)
  assert.match(analyticsHtml, /Retry-After/)
  assert.match(analyticsHtml, /RateLimit-Reset/)
  assert.match(analyticsHtml, /var MAX_RETRIES = 3/)
})
