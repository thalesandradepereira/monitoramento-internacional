import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('release notes heredoc closes on its own line before gh release create', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8')
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
  const delimiter = "cat > /tmp/release-notes.md <<'EOF'"
  const start = workflow.indexOf(delimiter)
  assert.notEqual(start, -1, 'release notes heredoc missing')
  const tail = workflow.slice(start)
  assert.match(tail, /\n[ ]+EOF\r?\n[ ]+gh release create /, 'heredoc sentinel and release command must occupy distinct lines')
  assert.ok(tail.includes('gh release create v' + version + ' --repo'), 'release tag must match package version')
})
