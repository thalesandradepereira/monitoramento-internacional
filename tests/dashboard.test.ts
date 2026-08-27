import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarIdentidadeDashboard } from '../src/branding'
import { gerarDashboardHTML, serializeForInlineScript } from '../src/dashboard'

test('serialização inline neutraliza fechamento de script e separadores JavaScript', () => {
  const serialized = serializeForInlineScript({
    value: '</script><script>alert("xss")</script>&\u2028\u2029',
  })

  assert.equal(serialized.includes('</script>'), false)
  assert.equal(serialized.includes('<script>'), false)
  assert.equal(serialized.includes('&'), false)
  assert.match(serialized, /\\u003c\/script\\u003e/)
  assert.match(serialized, /\\u2028/)
  assert.match(serialized, /\\u2029/)
})

test('dashboard aplica CSP com nonce, valida links e permite somente o analytics aprovado', () => {
  const malicious = [{
    fonte: '</script><script>alert("source")</script>',
    pais: 'Brasil',
    titulo: 'Notícia segura',
    resumo: '- Resumo',
    link: 'javascript:alert("link")',
    categoria: 'TESTE',
  }]

  const html = aplicarIdentidadeDashboard(gerarDashboardHTML(malicious, malicious, '26/07/2026'))
  const nonce = html.match(/script-src 'nonce-([^']+)'/)?.[1]

  assert.ok(nonce)
  assert.ok(html.includes(`<script nonce="${nonce}">`))
  assert.ok(html.includes(`<style nonce="${nonce}">`))
  assert.match(html, /style-src 'nonce-[^']+';/)
  assert.doesNotMatch(html, /style-src 'unsafe-inline'/)
  assert.doesNotMatch(html, /style="/)
  assert.equal(html.includes('</script><script>alert("source")'), false)
  assert.match(html, /function safeHttpUrl/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /connect-src https:\/\/abacus\.jasoncameron\.dev;/)
  assert.doesNotMatch(html, /fonts\.googleapis\.com/)
  assert.match(html, /https:\/\/abacus\.jasoncameron\.dev\/hit\/tap-intl-monitor\//)
  assert.match(html, /startsWith\('Dashboard-Monitoramento-'\)/)
  assert.match(html, /credentials: 'omit'/)
  assert.match(html, /referrerPolicy: 'no-referrer'/)
  assert.match(html, /Monitoramento Mídia Internacional \| Global Media Monitoring/)
})
