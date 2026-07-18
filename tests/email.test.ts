import test from 'node:test'
import assert from 'node:assert/strict'

function clearSrcModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/')) delete require.cache[key]
  }
}

test('logs de envio não expõem e-mails completos e o módulo não recarrega destinatários', async () => {
  clearSrcModules()
  const token = 'super-secret-token'
  process.env.RECIPIENTS_API_TOKEN = token
  process.env.UNSUBSCRIBE_SECRET = 'unsubscribe-secret'
  process.env.RECIPIENTS_SOURCE = 'd1'
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('enviarEmail não deve consultar a API de destinatários')
  }) as typeof fetch

  const sendMailCalls: unknown[] = []
  const nodemailerId = require.resolve('nodemailer')
  require.cache[nodemailerId] = { id: nodemailerId, filename: nodemailerId, loaded: true, exports: { createTransport: () => ({ sendMail: async (payload: unknown) => { sendMailCalls.push(payload); return { messageId: 'message-1' } } }) }, children: [], paths: [] } as NodeJS.Module

  const logs: string[] = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')) }
  try {
    const { enviarEmail } = require('../src/email') as typeof import('../src/email')
    const report = await enviarEmail([], [], '01/01/2099', ['alice.private@example.com'], 'd1')
    assert.ok(report.attempted > 0)
    assert.equal(report.sent, report.attempted)
    assert.equal(report.failed, 0)
    assert.equal(sendMailCalls.length, report.attempted)
    assert.equal(fetchCalls, 0)
  } finally {
    console.log = originalLog
    console.error = originalError
    globalThis.fetch = originalFetch
    delete process.env.RECIPIENTS_API_TOKEN
    delete process.env.RECIPIENTS_SOURCE
    clearSrcModules()
  }

  const output = logs.join('\n')
  assert.equal(output.includes('alice.private@example.com'), false)
  assert.equal(output.includes('owner.private@example.test'), false)
  assert.equal(output.includes(token), false)
  assert.match(output, /[a-z]{2}\*+@\*\*\*\.com/)
})

test('envio real é bloqueado sem destinatários pré-validados', async () => {
  clearSrcModules()
  try {
    const { enviarEmail } = require('../src/email') as typeof import('../src/email')
    await assert.rejects(enviarEmail([], [], '01/01/2099'), /destinatários não foram pré-validados/)
  } finally {
    clearSrcModules()
  }
})
