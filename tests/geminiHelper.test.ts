import test from 'node:test'
import assert from 'node:assert/strict'
import { isRetryableGeminiError, sanitizeGeminiJsonSchema } from '../src/geminiHelper'

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
