import test from 'node:test'
import assert from 'node:assert/strict'

function clearSrcModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/')) delete require.cache[key]
  }
}

function withEnv(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key]
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function loadWithEnv(env: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const restoreEnv = withEnv({
    RECIPIENTS_SOURCE: undefined,
    RECIPIENTS_API_URL: undefined,
    RECIPIENTS_API_TOKEN: undefined,
    RECIPIENTS_API_TIMEOUT_MS: undefined,
    RECIPIENTS_MAX_RECIPIENTS: undefined,
    DEST_EMAIL: undefined,
    ...env,
  })
  const originalFetch = globalThis.fetch
  if (fetchImpl) globalThis.fetch = fetchImpl
  clearSrcModules()
  const mod = require('../src/recipients') as typeof import('../src/recipients')
  return { mod, restore: () => { globalThis.fetch = originalFetch; restoreEnv(); clearSrcModules() } }
}

test('modo github legado usa DEST_EMAIL e recipients.txt, normaliza e deduplica', async () => {
  const { mod, restore } = await loadWithEnv({ DEST_EMAIL: ' USER@Example.com,other@example.com' })
  try {
    const result = await mod.loadRecipients()
    assert.equal(result.source, 'github')
    assert.ok(result.recipients.includes('user@example.com'))
    assert.ok(result.recipients.includes('other@example.com'))
    assert.equal(new Set(result.recipients).size, result.recipients.length)
  } finally { restore() }
})

test('modo d1 autenticado consulta API privada com Bearer no header e sem token na URL', async () => {
  let requestedUrl = ''
  let auth = ''
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url)
    auth = String((init?.headers as Record<string, string>).Authorization)
    return new Response(JSON.stringify({ recipients: ['A@EXAMPLE.com', 'b@example.com'] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'secret-token' }, fetchMock)
  try {
    const result = await mod.loadRecipients()
    assert.deepEqual(result, { source: 'd1', recipients: ['a@example.com', 'b@example.com'] })
    assert.equal(auth, 'Bearer secret-token')
    assert.equal(requestedUrl.includes('secret-token'), false)
  } finally { restore() }
})

test('modo d1 exige token', async () => {
  let calls = 0
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1' }, (async () => { calls++; throw new Error('unexpected') }) as typeof fetch)
  try {
    await assert.rejects(mod.loadRecipients(), /RECIPIENTS_API_TOKEN obrigatório/)
    assert.equal(calls, 0)
  } finally { restore() }
})

for (const status of [401, 500]) {
  test(`modo d1 falha fechado em HTTP ${status}`, async () => {
    const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token' }, (async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } })) as typeof fetch)
    try { await assert.rejects(mod.loadRecipients(), new RegExp(`HTTP ${status}`)) } finally { restore() }
  })
}

test('modo d1 aplica timeout', async () => {
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  })) as typeof fetch
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token', RECIPIENTS_API_TIMEOUT_MS: '5' }, fetchMock)
  try { await assert.rejects(mod.loadRecipients(), /Timeout/) } finally { restore() }
})

test('modo d1 aplica timeout quando headers chegam mas corpo JSON trava', async () => {
  let jsonStarted = false
  let abortedDuringBody = false
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => {
      jsonStarted = true
      return new Promise<unknown>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortedDuringBody = true
          reject(Object.assign(new Error('aborted body'), { name: 'AbortError' }))
        })
      })
    },
  } as unknown as Response)) as typeof fetch
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token', RECIPIENTS_API_TIMEOUT_MS: '5' }, fetchMock)
  try {
    await assert.rejects(mod.loadRecipients(), /Timeout/)
    assert.equal(jsonStarted, true)
    assert.equal(abortedDuringBody, true)
  } finally { restore() }
})

test('modo d1 rejeita resposta não JSON', async () => {
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token' }, (async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })) as typeof fetch)
  try { await assert.rejects(mod.loadRecipients(), /Content-Type inválido/) } finally { restore() }
})

test('modo d1 rejeita lista vazia', async () => {
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token' }, (async () => new Response(JSON.stringify({ recipients: [] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch)
  try { await assert.rejects(mod.loadRecipients(), /Lista vazia/) } finally { restore() }
})

test('modo d1 deduplica destinatários', async () => {
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token' }, (async () => new Response(JSON.stringify({ recipients: ['A@example.com', 'a@example.com'] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch)
  try { assert.deepEqual((await mod.loadRecipients()).recipients, ['a@example.com']) } finally { restore() }
})

test('modo d1 rejeita lista acima do limite', async () => {
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token', RECIPIENTS_MAX_RECIPIENTS: '1' }, (async () => new Response(JSON.stringify({ recipients: ['a@example.com', 'b@example.com'] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch)
  try { await assert.rejects(mod.loadRecipients(), /Lista excessiva/) } finally { restore() }
})

test('modo d1 não faz fallback para github quando API falha', async () => {
  const { mod, restore } = await loadWithEnv({ RECIPIENTS_SOURCE: 'd1', RECIPIENTS_API_TOKEN: 'token', DEST_EMAIL: 'fallback@example.com' }, (async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })) as typeof fetch)
  try {
    await assert.rejects(mod.loadRecipients(), /HTTP 500/)
  } finally { restore() }
})
