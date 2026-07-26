import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { resolveSingleRecipientByHash } from '../scripts/send-isolated-smoke'

const target = 'recipient@example.test'
const targetHash = createHash('sha256').update(target).digest('hex')

test('isolated smoke resolves exactly one authorized recipient without exposing it in configuration', () => {
  assert.equal(
    resolveSingleRecipientByHash(['other@example.test', target], targetHash),
    target,
  )
  assert.throws(
    () => resolveSingleRecipientByHash(['other@example.test'], targetHash),
    /correspondências=0/,
  )
  assert.throws(
    () => resolveSingleRecipientByHash([target, target], targetHash),
    /correspondências=2/,
  )
})
