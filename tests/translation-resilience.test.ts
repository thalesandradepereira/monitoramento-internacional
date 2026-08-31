import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { traduzirEstruturaSemGemini } from '../src/translationFallback'

test('contingência traduz título e resumo sem alterar fonte ou link', async () => {
  const originalFetch = globalThis.fetch
  const originalApiKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY
  delete process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY

  globalThis.fetch = async () => new Response(JSON.stringify([
    [[
      'ZXQ0000QXZ Global market advances\\nZXQ0001QXZ Complete translated summary',
      null,
      null,
      null,
    ]],
  ]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  try {
    const original = [{
      fonte: 'Reuters',
      pais: 'Brasil',
      titulo: 'Mercado global avança',
      resumo: 'Resumo completo traduzido',
      link: 'https://example.com/news',
      categoria: 'Negócios',
    }]

    const translated = await traduzirEstruturaSemGemini(original)

    assert.equal(translated[0].pais, 'Brazil')
    assert.equal(translated[0].titulo, 'Global market advances')
    assert.equal(translated[0].resumo, 'Complete translated summary')
    assert.equal(translated[0].categoria, 'Business')
    assert.equal(translated[0].fonte, original[0].fonte)
    assert.equal(translated[0].link, original[0].link)
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY
    } else {
      process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY = originalApiKey
    }
  }
})

test('tradutor principal nunca usa o lote original como fallback da versão inglesa', async () => {
  const source = await readFile(new URL('../src/translate.ts', import.meta.url), 'utf8')
  assert.match(source, /traduzirEstruturaSemGemini/)
  assert.doesNotMatch(source, /topicosEn\.push\(\.\.\.lote\)/)
})
