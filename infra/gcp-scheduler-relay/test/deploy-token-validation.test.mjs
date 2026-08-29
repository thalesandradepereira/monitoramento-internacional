import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

const helper = path.resolve('lib/validate-github-token.sh')

function validate(token) {
  return spawnSync(
    'bash',
    ['-lc', 'source "$1"; validate_github_dispatch_token "$2"', 'bash', helper, token],
    { encoding: 'utf8' },
  )
}

test('rejects a duplicated fine-grained token paste before any API call', () => {
  const result = validate('github_pat_example123github_pat_example123')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /duplicated/i)
})

test('rejects a token containing whitespace', () => {
  const result = validate('github_pat_example token')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /whitespace/i)
})

test('rejects a value that is not a fine-grained GitHub token', () => {
  const result = validate('not-a-github-token')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /fine-grained/i)
})

test('accepts a single plausible fine-grained token value', () => {
  const result = validate('github_pat_example1234567890')
  assert.equal(result.status, 0, result.stderr)
})
