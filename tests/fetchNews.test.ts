import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchRssXml, isRetryableRssError, newsHistoryKey, normalizeTitle } from '../src/fetchNews'

test('normalização preserva alfabetos não latinos e remove apenas pontuação', () => {
  assert.equal(normalizeTitle('中国：人工智能发展！'), '中国人工智能发展')
  assert.equal(normalizeTitle('日本のAI—最新ニュース'), '日本のai最新ニュース')
  assert.equal(normalizeTitle('  Ciência & Tecnologia: 2026  '), 'ciênciatecnologia2026')
})

test('chave de histórico é determinística e limitada', () => {
  const title = `Notícia ${'muito longa '.repeat(40)}`
  assert.equal(newsHistoryKey(title), newsHistoryKey(title))
  assert.ok(newsHistoryKey(title).length <= 160)
})

test('coleta RSS tenta novamente em HTTP 503 e preserva headers identificáveis', async () => {
  let calls = 0
  const waits: number[] = []
  const seenHeaders: HeadersInit[] = []
  const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1
    seenHeaders.push(init?.headers || {})
    if (calls < 3) return new Response('temporariamente indisponível', { status: 503 })
    return new Response('<rss version="2.0"><channel><title>ok</title></channel></rss>', {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' },
    })
  }) as typeof fetch

  const xml = await fetchRssXml('https://news.google.com/rss/test', fetchMock, async ms => { waits.push(ms) })

  assert.match(xml, /<rss/)
  assert.equal(calls, 3)
  assert.deepEqual(waits, [2000, 4000])
  assert.match(JSON.stringify(seenHeaders[0]), /MonitoramentoInternacional/)
})

test('coleta RSS não repete erro HTTP permanente', async () => {
  let calls = 0
  const fetchMock = (async () => {
    calls += 1
    return new Response('consulta inválida', { status: 400 })
  }) as typeof fetch

  await assert.rejects(() => fetchRssXml(
    'https://news.google.com/rss/test',
    fetchMock,
    async () => { throw new Error('não deveria aguardar') },
  ), /HTTP 400/)
  assert.equal(calls, 1)
})

test('classificação de falhas RSS limita retry a falhas transitórias', () => {
  assert.equal(isRetryableRssError(Object.assign(new Error('HTTP 503'), { status: 503 })), true)
  assert.equal(isRetryableRssError(Object.assign(new Error('HTTP 404'), { status: 404 })), false)
  assert.equal(isRetryableRssError(new Error('fetch failed: ECONNRESET')), true)
})
