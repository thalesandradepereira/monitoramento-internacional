import test from 'node:test'
import assert from 'node:assert/strict'
import { isGeminiQuotaExhausted } from '../src/geminiHelper'

// Injeção de dependências em memória: nenhum token, rede, e-mail ou arquivo de produção.
function loadSummarizerWithGeminiMock(
  generate: (model: string, prompt: string) => Promise<{ text: string }>,
) {
  const helperId = require.resolve('../src/geminiHelper')
  const configId = require.resolve('../src/config')
  const summaryId = require.resolve('../src/summarize')
  const savedHelper = require.cache[helperId]
  const savedConfig = require.cache[configId]
  const savedSummary = require.cache[summaryId]
  const fake = (id: string, exports: unknown) => {
    require.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] } as NodeJS.Module
  }

  fake(helperId, {
    isGeminiQuotaExhausted,
    cleanGeminiJson: (value: string) => value,
    generateContentWithRetry: generate,
  })
  fake(configId, {
    config: {
      gemini: { models: { triage: 'triage-mock', summary: 'summary-mock', summaryFallback: 'fallback-mock' } },
      maxTopicos: 50,
    },
  })
  delete require.cache[summaryId]

  const { resumirNoticias } = require('../src/summarize') as typeof import('../src/summarize')
  const restore = () => {
    if (savedHelper) require.cache[helperId] = savedHelper
    else delete require.cache[helperId]
    if (savedConfig) require.cache[configId] = savedConfig
    else delete require.cache[configId]
    if (savedSummary) require.cache[summaryId] = savedSummary
    else delete require.cache[summaryId]
  }
  return { resumirNoticias, restore }
}

const news = [
  { fonte: 'Fonte BR', pais: 'Brasil', titulo: 'Inovação nacional', link: 'https://example.test/br', data: new Date('2026-10-03T05:00:00Z') },
  { fonte: 'Fonte US', pais: 'Estados Unidos', titulo: 'Inovação internacional', link: 'https://example.test/us', data: new Date('2026-10-03T05:00:00Z') },
]

function responseForCountry(prompt: string): string {
  const brazil = prompt.includes('CANDIDATOS PARA BRASIL')
  return JSON.stringify([{
    id: brazil ? '0' : '1',
    titulo: brazil ? 'Inovação no Brasil' : 'Inovação nos EUA',
    resumo: 'Resumo editorial sintético verificável.',
    categoria: 'TECNOLOGIA',
  }])
}

test('429 genérico no primeiro país aciona fallback para o próprio Brasil e preserva cobertura', async () => {
  const models: string[] = []
  const { resumirNoticias, restore } = loadSummarizerWithGeminiMock(async (model, prompt) => {
    models.push(model)
    if (model === 'triage-mock') return { text: '[{"id":"0","pais":"Brasil"},{"id":"1","pais":"Estados Unidos"}]' }
    if (model === 'summary-mock') {
      throw Object.assign(new Error('429 Your project has exceeded a quota. See https://ai.dev/rate-limit.'), { status: 429 })
    }
    return { text: responseForCountry(prompt) }
  })

  try {
    const topics = await resumirNoticias(news)
    assert.deepEqual(topics.map(item => item.pais), ['Brasil', 'Estados Unidos'])
    assert.deepEqual(models, ['triage-mock', 'summary-mock', 'fallback-mock', 'fallback-mock'])
  } finally {
    restore()
  }
})

test('quota esgotada nos dois modelos bloqueia edição inteira, sem omitir Brasil silenciosamente', async () => {
  const models: string[] = []
  const { resumirNoticias, restore } = loadSummarizerWithGeminiMock(async (model) => {
    models.push(model)
    if (model === 'triage-mock') return { text: '[{"id":"0","pais":"Brasil"},{"id":"1","pais":"Estados Unidos"}]' }
    throw Object.assign(new Error('429 Your project has exceeded a quota.'), { status: 429 })
  })

  try {
    await assert.rejects(resumirNoticias(news), /Cobertura editorial incompleta: falha em Brasil, Estados Unidos/)
    assert.deepEqual(models, ['triage-mock', 'summary-mock', 'fallback-mock'])
  } finally {
    restore()
  }
})
