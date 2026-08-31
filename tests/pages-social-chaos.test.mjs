import assert from 'node:assert/strict'
import test from 'node:test'
import * as social from '../scripts/dispatch-social-publisher.mjs'

test('social dispatch exposes a /hoje alias validator before publishing Story', () => {
  assert.equal(typeof social.waitForPublishedAlias, 'function')
})

test('stale /hoje alias is rejected even when the dated dashboard exists', async () => {
  assert.equal(typeof social.waitForPublishedAlias, 'function')
  const fetchImpl = async () => new Response('<html><body>30/08/2026</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
  await assert.rejects(
    social.waitForPublishedAlias({
      aliasUrl: 'https://example.test/hoje',
      displayDate: '31/08/2026',
      maxAttempts: 1,
      retryDelayMs: 0,
      fetchImpl,
      sleepImpl: async () => {},
    }),
    /não corresponde|disponível|esperado/i,
  )
})
