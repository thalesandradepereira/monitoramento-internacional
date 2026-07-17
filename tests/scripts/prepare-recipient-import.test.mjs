import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRecipientsText, validateImportPlan, MAX_IMPORT_RECIPIENTS } from '../../scripts/prepare-recipient-import.mjs'

test('prepares import payload with normalized fictitious recipients only', () => {
  const plan = parseRecipientsText(' Alice@Example.test, bob@example.test\n# comment\ncarol@example.test\n')
  assert.deepEqual(JSON.parse(plan.payload), { recipients: ['alice@example.test', 'bob@example.test', 'carol@example.test'] })
  assert.deepEqual(validateImportPlan(plan), [])
  assert.equal(plan.counts.uniqueRecipients, 3)
})

test('reports aggregate invalid and duplicate counts without exposing values', () => {
  const plan = parseRecipientsText('duplicate@example.test\nDUPLICATE@example.test\ninvalid-address\n')
  assert.equal(plan.counts.duplicateEntries, 1)
  assert.equal(plan.counts.invalidEntries, 1)
  assert.deepEqual(validateImportPlan(plan), ['invalid_recipient_entries', 'duplicate_recipient_entries'])
})

test('enforces the Worker recipient limit before any upload', () => {
  const source = Array.from({ length: MAX_IMPORT_RECIPIENTS + 1 }, (_, index) => `person-${index}@example.test`).join('\n')
  const plan = parseRecipientsText(source)
  assert.equal(plan.counts.uniqueRecipients, MAX_IMPORT_RECIPIENTS + 1)
  assert.ok(validateImportPlan(plan).includes('recipient_limit_exceeded'))
})
