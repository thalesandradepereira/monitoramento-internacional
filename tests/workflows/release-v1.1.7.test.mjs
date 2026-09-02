import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const releaseWorkflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')
const prepareScript = fileURLToPath(new URL('../../scripts/prepare-release-v1.1.7.mjs', import.meta.url))

test('v1.1.7 release preparation updates version, bilingual incident notes and schedule documentation in isolation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-v117-'))
  for (const file of ['README.md', 'package.json', 'package-lock.json']) {
    copyFileSync(join(root, file), join(dir, file))
  }

  const result = spawnSync(process.execPath, [prepareScript], { cwd: dir, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'))
  const readme = readFileSync(join(dir, 'README.md'), 'utf8')

  assert.equal(pkg.version, '1.1.7')
  assert.equal(lock.version, '1.1.7')
  assert.equal(lock.packages[''].version, '1.1.7')
  assert.match(readme, /\*\*Versão \/ Version:\*\* 1\.1\.7/)
  assert.match(readme, /### Atualização operacional — 02\/09\/2026/)
  assert.match(readme, /### Operational update — 2026-09-02/)
  assert.match(readme, /02:17, 02:47, 03:17, 03:47/)
  assert.match(readme, /04:29, 04:59, 05:29, 05:59, 06:29, 06:59/)
  assert.match(readme, /deploy v1\.1\.7: 03:11–06:41 a cada 30 min/)
  assert.match(readme, /Nenhum provedor externo oferece garantia matemática de 100% de disponibilidade/)
})

test('release gate revalidates production and does not silently deploy Google Cloud infrastructure', () => {
  assert.match(releaseWorkflow, /name: Publicar v1\.1\.7/)
  assert.match(releaseWorkflow, /node scripts\/prepare-release-v1\.1\.7\.mjs/)
  assert.match(releaseWorkflow, /npm audit --audit-level=moderate/)
  assert.match(releaseWorkflow, /npm test/)
  assert.match(releaseWorkflow, /npm --prefix infra\/gcp-scheduler-relay test/)
  assert.match(releaseWorkflow, /docker build --tag tap-gcp-scheduler-relay:release-v1\.1\.7/)
  assert.match(releaseWorkflow, /Validar GitHub Pages \/hoje e dashboard com cache-busting/)
  assert.match(releaseWorkflow, /Validar publicação social da data/)
  assert.match(releaseWorkflow, /gh release create v1\.1\.7/)
  assert.doesNotMatch(releaseWorkflow, /gcloud\s+(run|scheduler|services|secrets)/)
})
