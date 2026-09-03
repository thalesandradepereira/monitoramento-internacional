import test from 'node:test'
import assert from 'node:assert/strict'
import { isGeminiQuotaExhausted, isRetryableGeminiError, sanitizeGeminiJsonSchema } from '../src/geminiHelper'

test('retry Gemini ocorre somente em falhas transitórias', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableGeminiError({ status }), true)
  }
  for (const status of [400, 401, 403, 404]) {
    assert.equal(isRetryableGeminiError({ status }), false)
  }
})

test('retry reconhece status transitório presente na mensagem', () => {
  assert.equal(isRetryableGeminiError(new Error('503 service unavailable')), true)
  assert.equal(isRetryableGeminiError(new Error('invalid API key')), false)
})

test('quota diária/RPD esgotada é distinguida de rate limit transitório', () => {
  const quotaError = new Error(
    '429 You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash',
  )
  assert.equal(isGeminiQuotaExhausted(quotaError), true)
  assert.equal(isGeminiQuotaExhausted(new Error('429 Too Many Requests. Please retry in 15s.')), false)
  assert.equal(isGeminiQuotaExhausted(new Error('503 service unavailable')), false)
})

test('schema Gemini mantém somente o subconjunto comprovadamente aceito pela API', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'array',
    minItems: 1,
    maxItems: 10,
    items: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          minLength: 1,
          maxLength: 180,
          description: 'Título em português.',
        },
      },
      required: ['titulo'],
      additionalProperties: false,
    },
  }

  assert.deepEqual(sanitizeGeminiJsonSchema(schema), {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título em português.',
        },
      },
      required: ['titulo'],
    },
  })
})

test('helper usa a Interactions API recomendada para saída estruturada', async () => {
  const source = await import('node:fs/promises')
    .then(fs => fs.readFile(new URL('../src/geminiHelper.ts', import.meta.url), 'utf8'))

  assert.match(source, /gemini\.interactions\.create\(/)
  assert.match(source, /response_format:/)
  assert.match(source, /store:\s*false/)
  assert.doesNotMatch(source, /gemini\.models\.generateContent\(/)
})

test('helper respeita o teto observado de 5 RPM do modelo editorial gratuito', async () => {
  const source = await import('node:fs/promises')
    .then(fs => fs.readFile(new URL('../src/geminiHelper.ts', import.meta.url), 'utf8'))

  assert.match(source, /MIN_REQUEST_INTERVAL_MS\s*=\s*13000/)
})

test('resumo possui fallback explícito quando a quota do modelo editorial esgota', async () => {
  const source = await import('node:fs/promises')
    .then(fs => fs.readFile(new URL('../src/summarize.ts', import.meta.url), 'utf8'))

  assert.match(source, /isGeminiQuotaExhausted/)
  assert.match(source, /config\.gemini\.models\.summaryFallback/)
  assert.match(source, /modelo editorial .* quota.*fallback/i)
})
