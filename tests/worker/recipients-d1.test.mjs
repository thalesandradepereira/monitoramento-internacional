import test from 'node:test'
import assert from 'node:assert/strict'
import worker, {
  listActiveRecipients,
  normalizeEmail,
  recipientExists,
  unsubscribeRecipient,
  upsertRecipient,
  validateEmail,
} from '../../worker/index.js'

class MockD1 {
  constructor() {
    this.rows = new Map()
  }

  prepare(sql) {
    return new MockStatement(this, sql)
  }

  async batch(statements) {
    const out = []
    for (const statement of statements) out.push(await statement.run())
    return out
  }
}

class MockStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.params = []
  }

  bind(...params) {
    this.params = params
    return this
  }

  async first() {
    const email = this.params[0]
    const row = this.db.rows.get(email)
    if (!row) return null
    if (this.sql.includes('SELECT status')) return { status: row.status }
    return { id: row.id }
  }

  async all() {
    const results = [...this.db.rows.values()]
      .filter((row) => row.status === 'active')
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((row) => ({ email: row.email }))
    return { results }
  }

  async run() {
    const email = this.params[0]
    if (this.sql.startsWith('UPDATE recipients')) {
      const row = this.db.rows.get(email)
      if (!row || row.status === 'unsubscribed') return { meta: { changes: 0 } }
      row.status = 'unsubscribed'
      row.unsubscribed_at = '2026-07-17T00:00:00.000Z'
      return { meta: { changes: 1 } }
    }
    const row = this.db.rows.get(email)
    if (row) {
      row.status = 'active'
      row.unsubscribed_at = null
      return { meta: { changes: 1 } }
    }
    this.db.rows.set(email, {
      id: this.db.rows.size + 1,
      email,
      status: 'active',
      consent_source: this.params[1] || 'admin-import',
      unsubscribed_at: null,
    })
    return { meta: { changes: 1 } }
  }
}

function env(extra = {}) {
  return { DB: new MockD1(), RECIPIENTS_API_TOKEN: 'test-secret-token', ...extra }
}

async function json(res) {
  return res.json()
}

test('normalizes valid email and rejects invalid format', () => {
  assert.equal(normalizeEmail('  Pessoa@Example.COM  '), 'pessoa@example.com')
  assert.equal(validateEmail('pessoa@example.com'), true)
  assert.equal(normalizeEmail(''), null)
  assert.equal(normalizeEmail('sem-arroba'), null)
  assert.equal(normalizeEmail('bad@example'), null)
})

test('creates, detects duplicate, reactivates, unsubscribes and lists only active recipients', async () => {
  const e = env()
  assert.deepEqual(await upsertRecipient(e, 'Pessoa@Example.com'), { ok: true, status: 'created' })
  assert.equal(await recipientExists(e, 'pessoa@example.com'), true)
  assert.deepEqual(await upsertRecipient(e, ' pessoa@example.com '), { ok: true, status: 'existing' })
  assert.equal(await unsubscribeRecipient(e, 'PESSOA@example.com'), true)
  assert.deepEqual(await listActiveRecipients(e), [])
  assert.deepEqual(await upsertRecipient(e, 'pessoa@example.com'), { ok: true, status: 'reactivated' })
  assert.deepEqual(await listActiveRecipients(e), ['pessoa@example.com'])
})

test('internal recipients endpoint rejects missing, incorrect and missing secret bearer', async () => {
  const e = env()
  let res = await worker.fetch(new Request('https://worker.test/internal/recipients'), e)
  assert.equal(res.status, 401)

  res = await worker.fetch(new Request('https://worker.test/internal/recipients', { headers: { Authorization: 'Bearer wrong' } }), e)
  assert.equal(res.status, 401)

  res = await worker.fetch(new Request('https://worker.test/internal/recipients', { headers: { Authorization: 'Bearer test-secret-token' } }), env({ RECIPIENTS_API_TOKEN: '' }))
  assert.equal(res.status, 401)
})

test('internal recipients endpoint returns active recipients only with no-store cache', async () => {
  const e = env()
  await upsertRecipient(e, 'ativo@example.com')
  await upsertRecipient(e, 'inativo@example.com')
  await unsubscribeRecipient(e, 'inativo@example.com')

  const res = await worker.fetch(new Request('https://worker.test/internal/recipients', { headers: { Authorization: 'Bearer test-secret-token' } }), e)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await json(res), { recipients: ['ativo@example.com'], count: 1 })
})

test('import endpoint is idempotent, normalizes duplicates and counts invalid recipients', async () => {
  const e = env()
  await upsertRecipient(e, 'reativar@example.com')
  await unsubscribeRecipient(e, 'reativar@example.com')

  const req = new Request('https://worker.test/internal/recipients/import', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-secret-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients: [' Novo@Example.com ', 'novo@example.com', 'reativar@example.com', 'invalido'] }),
  })
  const res = await worker.fetch(req, e)
  assert.equal(res.status, 200)
  assert.deepEqual(await json(res), { received: 4, imported: 1, reactivated: 1, invalid: 1 })
  assert.deepEqual(await listActiveRecipients(e), ['novo@example.com', 'reativar@example.com'])
})

test('internal handlers do not log email addresses on D1 errors', async () => {
  const messages = []
  const original = console.error
  console.error = (...args) => messages.push(args.join(' '))
  try {
    const brokenEnv = { DB: { prepare: () => { throw new Error('db failed for privado@example.com') } }, RECIPIENTS_API_TOKEN: 'test-secret-token' }
    const res = await worker.fetch(new Request('https://worker.test/internal/recipients', { headers: { Authorization: 'Bearer test-secret-token' } }), brokenEnv)
    assert.equal(res.status, 500)
    assert.equal(messages.some((line) => line.includes('privado@example.com')), false)
  } finally {
    console.error = original
  }
})

test('RECIPIENTS_STORAGE defaults to github and d1 fails explicitly without DB', async () => {
  const originalFetch = globalThis.fetch
  let githubCalled = false
  globalThis.fetch = async () => {
    githubCalled = true
    return new Response(JSON.stringify({ content: btoa(''), sha: 'sha' }), { status: 200 })
  }
  try {
    const githubRes = await worker.fetch(new Request('https://worker.test/subscribe?email=novo@example.com'), { GH_PAT_UNSUB: 'fake', GH_REPO: 'owner/repo' })
    assert.equal(githubRes.status, 200)
    assert.equal(githubCalled, true)
  } finally {
    globalThis.fetch = originalFetch
  }

  const d1Res = await worker.fetch(new Request('https://worker.test/subscribe?email=novo@example.com'), { RECIPIENTS_STORAGE: 'd1' })
  assert.equal(d1Res.status, 500)
})
