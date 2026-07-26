import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('preflight Gemini isola compatibilidade sem importar envio de e-mail', async () => {
  const source = await readFile(
    new URL('../scripts/gemini-preflight.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /generateContent sem esquema/)
  assert.match(source, /Interactions sem esquema/)
  assert.match(source, /Interactions com esquema objeto mínimo/)
  assert.match(source, /Interactions com esquema de triagem mínimo/)
  assert.doesNotMatch(source, /SMTP_|enviarEmail|RECIPIENTS_|loadRecipients/)
  assert.doesNotMatch(source, /GEMINI_API_KEY/)
})
