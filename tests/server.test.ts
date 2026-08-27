import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import test from 'node:test'

import { createSubscriptionApp } from '../src/server'

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = createSubscriptionApp('https://worker.example.test')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve())
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('legacy root redirects to the authoritative Worker invite page', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, { redirect: 'manual' })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), 'https://worker.example.test/invite')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-powered-by'), null)
  })
})

test('legacy subscribe endpoint delegates POST to D1 Worker without reflecting input', async () => {
  await withServer(async (baseUrl) => {
    const malicious = '<script>alert(1)</script>@example.com'
    const response = await fetch(`${baseUrl}/subscribe`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: malicious }),
    })

    assert.equal(response.status, 307)
    assert.equal(
      response.headers.get('location'),
      'https://worker.example.test/subscribe',
    )
    const body = await response.text()
    assert.doesNotMatch(body, /<script>|example\.com/)
  })
})

test('legacy subscribe rejects methods other than POST', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/subscribe`, {
      method: 'GET',
      redirect: 'manual',
    })
    assert.equal(response.status, 405)
  })
})
