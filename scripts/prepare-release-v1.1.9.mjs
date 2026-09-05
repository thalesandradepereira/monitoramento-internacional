import fs from 'node:fs'

const VERSION = '1.1.9'

function updateJson(file, mutate) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  mutate(value)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

updateJson('package.json', pkg => {
  pkg.version = VERSION
})

updateJson('package-lock.json', lock => {
  lock.version = VERSION
  if (!lock.packages?.['']) throw new Error('package-lock root package missing')
  lock.packages[''].version = VERSION
})

let readme = fs.readFileSync('README.md', 'utf8')
readme = readme.replace(/\*\*Versão \/ Version:\*\* 1\.1\.8/, '**Versão / Version:** 1.1.9')

for (const marker of [
  '### Release v1.1.9 — hardening final de produção em 05/09/2026',
  '### v1.1.9 — production hardening completed on 2026-09-05',
  '33965818735',
  '33965937669',
  '11,41 3-6 * * *',
  '21,51 3-6 * * *',
]) {
  if (!readme.includes(marker)) throw new Error(`README release marker missing: ${marker}`)
}

fs.writeFileSync('README.md', readme, 'utf8')
