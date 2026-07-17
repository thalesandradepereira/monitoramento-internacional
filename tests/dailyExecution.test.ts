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
