import test from 'node:test'
import assert from 'node:assert/strict'

function loadConfigWithDryRun(value: string | undefined) {
  if (value === undefined) delete process.env.DRY_RUN
  else process.env.DRY_RUN = value
  delete require.cache[require.resolve('../src/config')]
  return require('../src/config').config as { dryRun: boolean; cron: string; recipients: { source: string; apiUrl: string } }
}

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key]
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  try {
    fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    delete require.cache[require.resolve('../src/config')]
  }
}

test('DRY_RUN ausente mantém dry run seguro', () => {
  const config = loadConfigWithDryRun(undefined)
  assert.equal(config.dryRun, true)
})

test('DRY_RUN=true mantém dry run', () => {
  const config = loadConfigWithDryRun('true')
  assert.equal(config.dryRun, true)
})

test('DRY_RUN=false permite execução real explicitamente', () => {
  const config = loadConfigWithDryRun('false')
  assert.equal(config.dryRun, false)
})

test('cron local padrão usa 02:00 no timezone configurado', () => {
  delete process.env.CRON_EXPR
  const config = loadConfigWithDryRun(undefined)
  assert.equal(config.cron, '0 2 * * *')
})


test('RECIPIENTS_SOURCE padrão permanece github com URL privada configurada', () => {
  delete process.env.RECIPIENTS_SOURCE
  delete process.env.RECIPIENTS_API_URL
  const config = loadConfigWithDryRun(undefined)
  assert.equal(config.recipients.source, 'github')
  assert.equal(config.recipients.apiUrl, 'https://monitoramento-internacional-unsub.thalesandrade.workers.dev/internal/recipients')
})


for (const [name, envKey] of [
  ['timeout', 'RECIPIENTS_API_TIMEOUT_MS'],
  ['limite máximo', 'RECIPIENTS_MAX_RECIPIENTS'],
] as const) {
  for (const value of ['abc', 'NaN', '0', '-1', '1.5']) {
    test(`${name} de destinatários rejeita valor inválido ${value}`, () => {
      withEnv({ [envKey]: value }, () => {
        assert.throws(() => loadConfigWithDryRun(undefined), /número inteiro positivo/)
      })
    })
  }
}
