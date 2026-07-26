import test from 'node:test'
import assert from 'node:assert/strict'
import { isRetryableGeminiError } from '../src/geminiHelper'

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
