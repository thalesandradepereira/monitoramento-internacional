import test from 'node:test'
import assert from 'node:assert/strict'

function mockModule(modulePath: string, exports: Record<string, unknown>) {
  const id = require.resolve(modulePath)
  require.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] } as NodeJS.Module
}

function clearSrcModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/')) delete require.cache[key]
  }
}

function loadRunPipeline(options: {
  dryRun?: string
  emailReport?: { attempted: number; sent: number; failed: number }
  recipientsError?: Error
}) {
  clearSrcModules()
  if (options.dryRun === undefined) delete process.env.DRY_RUN
  else process.env.DRY_RUN = options.dryRun
  process.env.EXECUTION_MODE = 'manual'
  process.env.TIMEZONE = 'America/Sao_Paulo'
  delete process.env.GITHUB_ACTIONS

  const calls = {
    loadRecipients: 0,
    persist: [] as unknown[],
    commit: [] as string[],
    email: 0,
    history: 0,
    summarizeArgs: [] as unknown[][],
    translateArgs: [] as unknown[][],
    fsWrites: 0,
    recipients: 0,
  }

  const fs = require('node:fs') as typeof import('node:fs')
  const fsOriginals = {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    writeFileSync: fs.writeFileSync,
    copyFileSync: fs.copyFileSync,
  }
  fs.existsSync = ((target: fs.PathLike) => !String(target).endsWith('/logo.jpg')) as typeof fs.existsSync
  fs.mkdirSync = (() => undefined) as typeof fs.mkdirSync
  fs.writeFileSync = (() => { calls.fsWrites += 1 }) as typeof fs.writeFileSync
  fs.copyFileSync = (() => undefined) as typeof fs.copyFileSync
  const restore = () => {
    fs.existsSync = fsOriginals.existsSync
    fs.mkdirSync = fsOriginals.mkdirSync
    fs.writeFileSync = fsOriginals.writeFileSync
    fs.copyFileSync = fsOriginals.copyFileSync
  }

  mockModule('../src/fetchNews', {
    buscarNoticias: async () => [{ fonte: 'Fonte', pais: 'Brasil', titulo: 'Título', link: 'https://example.test/noticia', data: new Date('2099-01-01T05:00:00Z') }],
  })
  mockModule('../src/summarize', {
    resumirNoticias: async (...args: unknown[]) => { calls.summarizeArgs.push(args); return [{ pais: 'Brasil', titulo: 'Título', resumo: '- resumo', link: 'https://example.test/noticia', fonte: 'Fonte', categoria: 'GERAL' }] },
  })
  mockModule('../src/translate', {
    traduzirParaIngles: async (...args: unknown[]) => { calls.translateArgs.push(args); return [{ pais: 'Brazil', titulo: 'Title', resumo: '- summary', link: 'https://example.test/noticia', fonte: 'Source', categoria: 'GENERAL' }] },
  })
  mockModule('../src/dashboard', {
    gerarDashboardHTML: () => '<html>dashboard</html>',
  })
  mockModule('../src/history', {
    addSentNewsToHistory: () => { calls.history += 1 },
  })
  mockModule('../src/recipients', {
    loadRecipients: async () => {
      calls.recipients += 1
      if (options.recipientsError) throw options.recipientsError
      return { source: 'd1', recipients: ['masked@example.test'] }
    },
  })
  mockModule('../src/email', {
    enviarEmail: async () => {
      calls.email += 1
      return options.emailReport ?? { attempted: 1, sent: 1, failed: 0 }
    },
  })
  mockModule('../src/dailyExecution', {
    AlreadyCompletedExecutionError: class AlreadyCompletedExecutionError extends Error {},
    assertCanStartRealExecution: () => undefined,
    commitAndPushPersistentState: (message: string) => { calls.commit.push(message) },
    getZonedNow: () => ({ date: '2099-01-01', time: '02:00:00', timezone: 'America/Sao_Paulo' }),
    persistExecutionRecord: (record: unknown) => { calls.persist.push(record) },
    syncPersistentExecutionLog: () => undefined,
  })

  const run = require('../src/run') as { runPipeline: () => Promise<void> }
  return { runPipeline: run.runPipeline, calls, restore }
}

test('dry run ausente não envia e não altera persistência', async () => {
  const { runPipeline, calls, restore } = loadRunPipeline({ dryRun: undefined })
  try {
    await runPipeline()
  } finally {
    restore()
  }
  assert.equal(calls.email, 0)
  assert.equal(calls.history, 0)
  assert.equal(calls.persist.length, 0)
  assert.equal(calls.commit.length, 0)
  assert.equal(calls.fsWrites, 0)
  assert.equal(calls.recipients, 0)
})

test('falha parcial de e-mail persiste failed, sincroniza estado e termina com erro', async () => {
  const { runPipeline, calls, restore } = loadRunPipeline({ dryRun: 'false', emailReport: { attempted: 3, sent: 2, failed: 1 } })
  const originalExit = process.exit
  let exitCode: string | number | null | undefined
  ;(process.exit as unknown) = ((code?: string | number | null | undefined) => {
    exitCode = code
    throw new Error(`process.exit:${code}`)
  }) as typeof process.exit

  try {
    await assert.rejects(runPipeline(), /process\.exit:1/)
  } finally {
    process.exit = originalExit
    restore()
  }

  assert.equal(exitCode, 1)
  assert.equal(calls.recipients, 1)
  assert.equal(calls.email, 1)
  assert.equal(calls.history, 1)
  assert.equal(calls.persist.length, 2)
  assert.equal((calls.persist[1] as { state: string; attempted: number; sent: number; failed: number }).state, 'failed')
  assert.equal((calls.persist[1] as { state: string; attempted: number; sent: number; failed: number }).attempted, 3)
  assert.equal((calls.persist[1] as { state: string; attempted: number; sent: number; failed: number }).sent, 2)
  assert.equal((calls.persist[1] as { state: string; attempted: number; sent: number; failed: number }).failed, 1)
  assert.equal(calls.commit.length, 2)
})



test('falha ao carregar destinatários D1 antes do envio não persiste in_progress', async () => {
  const { runPipeline, calls, restore } = loadRunPipeline({ dryRun: 'false', recipientsError: new Error('[recipients] API privada retornou HTTP 401; fonte=d1.') })
  const originalExit = process.exit
  let exitCode: string | number | null | undefined
  ;(process.exit as unknown) = ((code?: string | number | null | undefined) => {
    exitCode = code
    throw new Error(`process.exit:${code}`)
  }) as typeof process.exit

  try {
    await assert.rejects(runPipeline(), /process\.exit:1/)
  } finally {
    process.exit = originalExit
    restore()
  }

  assert.equal(exitCode, 1)
  assert.equal(calls.recipients, 1)
  assert.equal(calls.persist.length, 0)
  assert.equal(calls.commit.length, 0)
  assert.equal(calls.email, 0)
  assert.equal(calls.history, 0)
})

test('destinatários não são enviados ao fluxo Gemini/sumarização e são pré-validados antes do envio', async () => {
  const { runPipeline, calls, restore } = loadRunPipeline({ dryRun: 'false' })
  try {
    await runPipeline()
  } finally {
    restore()
  }
  const serializedSummarizeArgs = JSON.stringify(calls.summarizeArgs)
  const serializedTranslateArgs = JSON.stringify(calls.translateArgs)
  assert.equal(serializedSummarizeArgs.includes('@'), false)
  assert.equal(serializedTranslateArgs.includes('@'), false)
  assert.equal(calls.recipients, 1)
  assert.equal(calls.email, 1)
})


test('dry run com RECIPIENTS_SOURCE=d1 não carrega destinatários nem consulta API', async () => {
  process.env.RECIPIENTS_SOURCE = 'd1'
  process.env.RECIPIENTS_API_TOKEN = 'token-for-test'
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error('unexpected fetch') }) as typeof fetch
  const { runPipeline, calls, restore } = loadRunPipeline({ dryRun: 'true' })
  try {
    await runPipeline()
  } finally {
    globalThis.fetch = originalFetch
    delete process.env.RECIPIENTS_SOURCE
    delete process.env.RECIPIENTS_API_TOKEN
    restore()
  }
  assert.equal(calls.email, 0)
  assert.equal(calls.recipients, 0)
  assert.equal(fetchCalls, 0)
})
