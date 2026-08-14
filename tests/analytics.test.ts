import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { gerarDashboardHTML } from '../src/dashboard'

const analyticsPath = path.join(process.cwd(), 'docs', 'analytics.html')
const analyticsHtml = fs.readFileSync(analyticsPath, 'utf8')

test('dashboard grava acessos no mesmo namespace consultado pelo painel', () => {
  const dashboardHtml = gerarDashboardHTML([], [], '02/08/2026')

  assert.match(
    dashboardHtml,
    /https:\/\/abacus\.jasoncameron\.dev\/hit\/tap-intl-monitor\//
  )
  assert.match(
    dashboardHtml,
    /connect-src https:\/\/abacus\.jasoncameron\.dev;/
  )
  assert.match(analyticsHtml, /var API_BASE = 'https:\/\/abacus\.jasoncameron\.dev'/)
  assert.match(analyticsHtml, /var NAMESPACE = 'tap-intl-monitor'/)
  assert.match(analyticsHtml, /API_BASE \+ '\/get\/' \+ NAMESPACE/)
})

test('dashboard envia analytics sem cookies, credenciais ou referer', () => {
  const dashboardHtml = gerarDashboardHTML([], [], '02/08/2026')

  assert.match(dashboardHtml, /credentials: 'omit'/)
  assert.match(dashboardHtml, /referrerPolicy: 'no-referrer'/)
  assert.match(dashboardHtml, /cache: 'no-store'/)
  assert.match(dashboardHtml, /startsWith\('Dashboard-Monitoramento-'\)/)
})

test('painel distingue contador inexistente de indisponibilidade da API', () => {
  assert.match(
    analyticsHtml,
    /resp\.status === 404\) return \{ available: true, count: 0 \}/
  )
  assert.match(
    analyticsHtml,
    /return \{ available: false, count: null \}/
  )
  assert.match(
    analyticsHtml,
    /valores indisponíveis não são tratados como zero/i
  )
  assert.doesNotMatch(
    analyticsHtml,
    /if \(!resp\.ok\) return 0/
  )
})
