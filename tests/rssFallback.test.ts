import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBingNewsRssUrl, fetchSourceFeed, unwrapNewsLink } from '../src/fetchNews'

const source = {
  nome: 'Brasil',
  url: 'https://news.google.com/rss/search?q=(economia+OR+ciência)+when:1d&hl=pt-BR&gl=BR',
}

const validRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Noticias</title>
<item><title>Noticia teste</title><link>https://example.org/materia</link><pubDate>Sun, 11 Oct 2026 06:00:00 GMT</pubDate></item>
</channel></rss>`

test('fallback Bing preserva consulta e localidade sem sintaxe Google when:1d', () => {
  const url = new URL(buildBingNewsRssUrl(source))
  assert.equal(url.hostname, 'www.bing.com')
  assert.equal(url.pathname, '/news/search')
  assert.equal(url.searchParams.get('format'), 'rss')
  assert.equal(url.searchParams.get('cc'), 'BR')
  assert.equal(url.searchParams.get('setlang'), 'pt-BR')
  assert.match(url.searchParams.get('q') || '', /ciência/)
  assert.doesNotMatch(url.searchParams.get('q') || '', /when:1d/)
})

test('503 em Google News dispara fallback independente e retorna notícias', async () => {
  const requests: string[] = []
  const fetchMock = (async (url: string | URL | Request) => {
    const requestUrl = String(url)
    requests.push(requestUrl)
    return requestUrl.includes('news.google.com')
      ? new Response('unavailable', { status: 503 })
      : new Response(validRss, { status: 200 })
  }) as typeof fetch

  const result = await fetchSourceFeed(source, fetchMock, async () => {})
  assert.equal(result.provider, 'bing')
  assert.equal(result.feed.items.length, 1)
  assert.equal(requests.filter(url => url.includes('news.google.com')).length, 3)
  assert.equal(requests.filter(url => url.includes('www.bing.com')).length, 1)
})

test('feed principal válido não aciona alternativa', async () => {
  const urls: string[] = []
  const fetchMock = (async (url: string | URL | Request) => {
    urls.push(String(url))
    return new Response(validRss, { status: 200 })
  }) as typeof fetch
  const result = await fetchSourceFeed(source, fetchMock, async () => {})
  assert.equal(result.provider, 'google')
  assert.equal(urls.length, 1)
})

test('ambos provedores indisponíveis falham fechados sem declarar cobertura válida', async () => {
  const fetchMock = (async () => new Response('offline', { status: 503 })) as typeof fetch
  await assert.rejects(
    () => fetchSourceFeed(source, fetchMock, async () => {}),
    /Google News.*Bing News.*HTTP 503/,
  )
})

test('RSS de resposta vazia é tratado como fonte indisponível e aciona alternativa', async () => {
  const emptyRss = '<rss version="2.0"><channel><title>vazio</title></channel></rss>'
  const fetchMock = (async (url: string | URL | Request) =>
    new Response(String(url).includes('news.google.com') ? emptyRss : validRss, { status: 200 })
  ) as typeof fetch
  const result = await fetchSourceFeed(source, fetchMock, async () => {})
  assert.equal(result.provider, 'bing')
  assert.equal(result.feed.items.length, 1)
})

test('URL de matéria redirecionada pelo Bing aponta para o veículo original', () => {
  const wrapper = 'https://www.bing.com/news/apiclick.aspx?ref=some&url=' + encodeURIComponent('https://jornal.example/noticia?a=1')
  assert.equal(unwrapNewsLink(wrapper), 'https://jornal.example/noticia?a=1')
  assert.equal(unwrapNewsLink('https://jornal.example/noticia'), 'https://jornal.example/noticia')
  assert.equal(unwrapNewsLink('https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)'), 'https://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)')
})
