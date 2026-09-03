import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function loadDailyExecution() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-execution-'))
  const logPath = path.join(dir, 'daily-executions.json')
  process.env.DAILY_EXECUTION_LOG_PATH = logPath
  process.env.TIMEZONE = 'America/Sao_Paulo'
  process.env.DRY_RUN = 'false'
  delete process.env.GITHUB_ACTIONS
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/src/config') || key.includes('/src/dailyExecution')) delete require.cache[key]
  }
  return { mod: require('../src/dailyExecution'), logPath }
}

test('completed bloqueia segundo envio de forma limpa', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({ date: '2099-01-01', time: '02:00:00', timezone: 'America/Sao_Paulo', state: 'completed', mode: 'scheduled', attempted: 1, sent: 1, failed: 0 })
  assert.throws(() => mod.assertCanStartRealExecution('2099-01-01'), mod.AlreadyCompletedExecutionError)
})

test('transição de in_progress para completed substitui o estado efetivo', () => {
  const { mod, logPath } = loadDailyExecution()
  mod.persistExecutionRecord({ date: '2099-01-02', time: '02:00:00', timezone: 'America/Sao_Paulo', state: 'in_progress', mode: 'scheduled', attempted: 0, sent: 0, failed: 0 })
  mod.persistExecutionRecord({ date: '2099-01-02', time: '02:05:00', timezone: 'America/Sao_Paulo', state: 'completed', mode: 'scheduled', attempted: 2, sent: 2, failed: 0 })
  const records = JSON.parse(fs.readFileSync(logPath, 'utf8')).records
  assert.equal(records.length, 1)
  assert.equal(records[0].state, 'completed')
  assert.throws(() => mod.assertCanStartRealExecution('2099-01-02'), mod.AlreadyCompletedExecutionError)
})

test('transição de in_progress para failed substitui o estado efetivo e bloqueia reenvio', () => {
  const { mod, logPath } = loadDailyExecution()
  mod.persistExecutionRecord({ date: '2099-01-03', time: '02:00:00', timezone: 'America/Sao_Paulo', state: 'in_progress', mode: 'scheduled', attempted: 0, sent: 0, failed: 0 })
  mod.persistExecutionRecord({ date: '2099-01-03', time: '02:04:00', timezone: 'America/Sao_Paulo', state: 'failed', mode: 'scheduled', attempted: 2, sent: 1, failed: 1 })
  const records = JSON.parse(fs.readFileSync(logPath, 'utf8')).records
  assert.equal(records.length, 1)
  assert.equal(records[0].state, 'failed')
  assert.throws(() => mod.assertCanStartRealExecution('2099-01-03'), /Reenvio automático bloqueado/)
})

test('falha antes de qualquer tentativa de entrega permite recuperação segura', () => {
  const { mod, logPath } = loadDailyExecution()
  mod.persistExecutionRecord({ date: '2099-01-04', time: '02:00:00', timezone: 'America/Sao_Paulo', state: 'in_progress', mode: 'scheduled', attempted: 0, sent: 0, failed: 0 })
  mod.persistExecutionRecord({ date: '2099-01-04', time: '02:04:00', timezone: 'America/Sao_Paulo', state: 'failed', mode: 'scheduled', attempted: 0, sent: 0, failed: 0 })
  const records = JSON.parse(fs.readFileSync(logPath, 'utf8')).records

  assert.equal(records.length, 1)
  assert.equal(records[0].state, 'failed')
  assert.doesNotThrow(() => mod.assertCanStartRealExecution('2099-01-04'))
})


test('falha total de autenticação SMTP permite reprocessamento seguro sem duplicidade', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({
    date: '2099-01-05',
    time: '02:55:32',
    timezone: 'America/Sao_Paulo',
    state: 'failed',
    mode: 'scheduled',
    attempted: 6,
    sent: 0,
    failed: 6,
  })

  assert.doesNotThrow(() => mod.assertCanStartRealExecution('2099-01-05'))
})

test('contabilidade incompleta das tentativas mantém o bloqueio preventivo', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({
    date: '2099-01-06',
    time: '03:00:00',
    timezone: 'America/Sao_Paulo',
    state: 'failed',
    mode: 'scheduled',
    attempted: 6,
    sent: 0,
    failed: 5,
  })

  assert.throws(() => mod.assertCanStartRealExecution('2099-01-06'), /Reenvio automático bloqueado/)
})

test('in_progress antigo sem qualquer tentativa é tratado como stale e permite recovery seguro', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({
    date: '2026-09-03',
    time: '02:36:54',
    timezone: 'America/Sao_Paulo',
    state: 'in_progress',
    mode: 'manual',
    attempted: 0,
    sent: 0,
    failed: 0,
  })

  assert.doesNotThrow(() => mod.assertCanStartRealExecution('2026-09-03', new Date('2026-09-03T08:27:00Z')))
})

test('in_progress recente continua bloqueado mesmo sem tentativas', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({
    date: '2026-09-03',
    time: '05:10:00',
    timezone: 'America/Sao_Paulo',
    state: 'in_progress',
    mode: 'manual',
    attempted: 0,
    sent: 0,
    failed: 0,
  })

  assert.throws(
    () => mod.assertCanStartRealExecution('2026-09-03', new Date('2026-09-03T08:27:00Z')),
    /Estado incerto/,
  )
})

test('in_progress antigo com tentativa registrada continua bloqueado', () => {
  const { mod } = loadDailyExecution()
  mod.persistExecutionRecord({
    date: '2026-09-03',
    time: '02:36:54',
    timezone: 'America/Sao_Paulo',
    state: 'in_progress',
    mode: 'manual',
    attempted: 1,
    sent: 0,
    failed: 0,
  })

  assert.throws(
    () => mod.assertCanStartRealExecution('2026-09-03', new Date('2026-09-03T08:27:00Z')),
    /Estado incerto/,
  )
})

test('classifica rejeição non-fast-forward como conflito recuperável', () => {
  const { mod } = loadDailyExecution()
  assert.equal(mod.isConcurrentPushRejection(new Error("! [rejected] HEAD -> main (non-fast-forward)")), true)
  assert.equal(mod.isConcurrentPushRejection(new Error("failed to push some refs; fetch first")), true)
})

test('não classifica falhas arbitrárias como conflito concorrente', () => {
  const { mod } = loadDailyExecution()
  assert.equal(mod.isConcurrentPushRejection(new Error("authentication failed")), false)
  assert.equal(mod.isConcurrentPushRejection(new Error("permission denied")), false)
  assert.equal(
    mod.isConcurrentPushRejection(new Error("remote: protected branch update failed\nerror: failed to push some refs")),
    false,
  )
})


test('classifica conflito real do execSync quando detalhe está somente no stderr', () => {
  const { mod } = loadDailyExecution()
  const execError = Object.assign(new Error('Command failed: git push origin HEAD:main'), {
    stderr: Buffer.from('! [rejected] HEAD -> main (fetch first)\nerror: failed to push some refs'),
    stdout: Buffer.alloc(0),
  })
  assert.equal(mod.isConcurrentPushRejection(execError), true)
})
