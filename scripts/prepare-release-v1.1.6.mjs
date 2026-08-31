import fs from 'node:fs'

const VERSION = '1.1.6'

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
readme = readme.replace('**Versão / Version:** 1.1.5', '**Versão / Version:** 1.1.6')

const ptMarker = '### Atualização operacional — 30/08/2026'
const ptSection = `### Atualização operacional — 31/08/2026

O Scheduler Chaos QA de 31/08/2026 ampliou o gate de produção para tratar atraso/ausência do scheduler, concorrência, recuperação externa e publicação social como domínios de falha independentes.

Foram identificadas e tratadas duas lacunas adicionais no Monitoramento Mídia: o comando de testes não incluía arquivos \`*.test.mjs\` diretamente na raiz de \`tests/\`, o que permitia um teste de chaos existir sem ser executado; e o publicador social validava o dashboard datado, mas não exigia que o alias público \`/hoje\` já estivesse na mesma edição antes de emitir o dispatch social. A v1.1.6 corrige ambos.

O gate atual passa a executar os testes MJS de raiz e bloqueia a publicação social enquanto \`/hoje\` estiver stale. O run GREEN do hardening social foi \`33382960655\`; a validação completa de release inclui suíte total, TypeScript, npm audit, Worker, relay GCP, Docker, YAML, GitHub Pages com cache-busting e estado social.

O controlador externo permanece idempotente e independente do scheduler do GitHub. A aprovação de QA significa 100% dos cenários determinísticos definidos no chaos matrix, sem afirmar impossibilidade matemática de falha simultânea de provedores externos.`
if (!readme.includes('### Atualização operacional — 31/08/2026')) {
  if (!readme.includes(ptMarker)) throw new Error('README PT marker not found')
  readme = readme.replace(ptMarker, `${ptSection}\n\n${ptMarker}`)
}

const enMarker = '### Operational update — 2026-08-30'
const enSection = `### Operational update — 2026-08-31

The 2026-08-31 Scheduler Chaos QA expanded the production gate to treat scheduler delay/absence, concurrency, external recovery, and social publication as independent failure domains.

Two additional Media Monitoring gaps were found and fixed: the test command did not include root-level \`tests/*.test.mjs\` files, allowing a chaos test to exist without being executed; and the social dispatcher validated the dated dashboard but did not require the public \`/hoje\` alias to point to the same edition before dispatching social publication. Version 1.1.6 closes both gaps.

The test gate now executes root MJS tests and social dispatch is blocked while \`/hoje\` is stale. The social hardening GREEN run is \`33382960655\`; the full release gate covers the complete suite, TypeScript, npm audit, Worker, GCP relay, Docker, YAML, cache-busted GitHub Pages, and social state.

QA approval means 100% of the deterministic scenarios defined in the chaos matrix passed; it does not claim mathematical impossibility of simultaneous external-provider failure.`
if (!readme.includes('### Operational update — 2026-08-31')) {
  if (!readme.includes(enMarker)) throw new Error('README EN marker not found')
  readme = readme.replace(enMarker, `${enSection}\n\n${enMarker}`)
}

fs.writeFileSync('README.md', readme, 'utf8')
