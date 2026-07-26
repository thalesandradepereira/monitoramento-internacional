import test from 'node:test'
import assert from 'node:assert/strict'
import { newsHistoryKey, normalizeTitle } from '../src/fetchNews'

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
