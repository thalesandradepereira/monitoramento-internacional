import fs from 'node:fs'

const VERSION = '1.1.11'

function updateJson(file, mutate) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  mutate(value)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

updateJson('package.json', pkg => { pkg.version = VERSION })
updateJson('package-lock.json', lock => {
  lock.version = VERSION
  if (!lock.packages?.['']) throw new Error('package-lock root package missing')
  lock.packages[''].version = VERSION
})

let readme = fs.readFileSync('README.md', 'utf8')
readme = readme.replace(/\*\*Versão \/ Version:\*\* 1\.1\.\d+/, '**Versão / Version:** 1.1.11')
for (const marker of [
  '### Release v1.1.11 — detecção da quota genérica Gemini em 03/10/2026',
  '### v1.1.11 — generic Gemini project quota recovery (2026-10-03)',
  '37102216929',
  '37103861595',
  'tests/summarizeFallback.test.ts',
]) {
  if (!readme.includes(marker)) throw new Error(`README release marker missing: ${marker}`)
}
fs.writeFileSync('README.md', readme, 'utf8')
