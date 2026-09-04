import fs from 'node:fs'

const VERSION = '1.1.8'

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
readme = readme.replace('**Versão / Version:** 1.1.7', '**Versão / Version:** 1.1.8')

const ptMarker = '### Atualização operacional — 31/08/2026'
const ptSection = `### Atualização operacional — 03/09/2026

A v1.1.8 fecha o incidente de 03/09/2026, no qual a síntese editorial com \`gemini-3.6-flash\` atingiu a quota definitiva da Gemini API (HTTP 429). O comportamento anterior ainda tentava novas chamadas e, após o timeout do job, podia deixar a execução diária em \`in_progress\` sem qualquer tentativa de entrega.

O pipeline agora classifica esgotamento definitivo de quota como não retentável, abre um circuit breaker para o modelo editorial e faz fallback controlado para \`gemini-3.5-flash-lite\`. A idempotência também permite recuperar automaticamente um \`in_progress\` abandonado somente quando ele tem mais de 45 minutos e registra simultaneamente \`attempted=0\`, \`sent=0\` e \`failed=0\`; qualquer evidência de tentativa ou entrega continua fail-closed.

As duas correções foram desenvolvidas com regressão RED→GREEN. A recuperação de estado teve RED no run \`33733637330\` e GREEN no run \`33733725525\`. A validação real de produção ocorreu no run \`33733907369\`: o estado stale foi reconhecido, o \`gemini-3.6-flash\` voltou a responder 429, o fallback foi acionado, o dashboard de 03/09 foi gerado e os 7 destinatários foram aceitos pelo SMTP, com \`attempted=7\`, \`sent=7\`, \`failed=0\`. A publicação social também foi concluída e uma execução posterior do Google Cloud Scheduler permaneceu idempotente, sem duplicar efeitos externos.

A lacuna do QA anterior era uma cadeia temporal composta que não estava modelada ponta a ponta: quota definitiva → retries prolongados → timeout abrupto → estado \`in_progress\` abandonado → recuperação subsequente. A matriz de regressão passa a tratar explicitamente essas condições. O release gate continua exigindo suíte completa, npm audit, TypeScript, Worker, relay GCP, Docker, YAML, artefatos da data, GitHub Pages e publicação social.`
if (!readme.includes('### Atualização operacional — 03/09/2026')) {
  if (!readme.includes(ptMarker)) throw new Error('README PT marker not found')
  readme = readme.replace(ptMarker, `${ptSection}\n\n${ptMarker}`)
}

const enMarker = '### Operational update — 2026-08-31'
const enSection = `### Operational update — 2026-09-03

Version 1.1.8 closes the 2026-09-03 incident in which editorial summarization with \`gemini-3.6-flash\` exhausted a definitive Gemini API quota (HTTP 429). The previous behavior could keep attempting calls and, after the job timeout, leave the daily execution as \`in_progress\` without any delivery attempt.

The pipeline now classifies definitive quota exhaustion as non-retryable, opens a circuit breaker for the editorial model, and performs a controlled fallback to \`gemini-3.5-flash-lite\`. Idempotency also permits automatic recovery of an abandoned \`in_progress\` record only when it is older than 45 minutes and simultaneously records \`attempted=0\`, \`sent=0\`, and \`failed=0\`; any evidence of an attempted or successful delivery remains fail-closed.

Both fixes were developed with RED→GREEN regression evidence. State recovery was RED in run \`33733637330\` and GREEN in run \`33733725525\`. Real production validation occurred in run \`33733907369\`: the stale state was recognized, \`gemini-3.6-flash\` returned 429 again, fallback was activated, the September 3 dashboard was generated, and all 7 recipients were accepted by SMTP with \`attempted=7\`, \`sent=7\`, \`failed=0\`. Social publication also completed, and a later Google Cloud Scheduler execution remained idempotent without duplicating external effects.

The previous QA gap was an end-to-end temporal chain that had not been modeled as one scenario: definitive quota exhaustion → prolonged retries → abrupt timeout → abandoned \`in_progress\` state → subsequent recovery. Regression coverage now explicitly addresses these conditions. The release gate continues to require the complete suite, npm audit, TypeScript, Worker, GCP relay, Docker, YAML, current-day artifacts, GitHub Pages, and social publication.`
if (!readme.includes('### Operational update — 2026-09-03')) {
  if (!readme.includes(enMarker)) throw new Error('README EN marker not found')
  readme = readme.replace(enMarker, `${enSection}\n\n${enMarker}`)
}


const ptValidationMarker = '### Atualização operacional — 03/09/2026'
const ptValidationSection = `### Atualização operacional — 04/09/2026

A v1.1.8 registra a validação operacional de produção de 04/09/2026. A edição diária alcançou estado \`completed\`, o dashboard \`Dashboard-Monitoramento-04-09-2026.html\` foi persistido, o alias \`/hoje\` apontou para a mesma data e o Instagram concluiu com \`platform_id\` não vazio.

O failsafe externo do Google Cloud Scheduler foi comprovado novamente em produção pelo run \`33860370126\`, evento \`repository_dispatch\` com modo \`gcp-scheduler\`. O guard aceitou o target de mídia e, ao chegar ao passo de execução real, encontrou 04/09 já concluído e encerrou explicitamente sem novo envio. O job social subsequente foi ignorado, preservando idempotência e evitando Story duplicado.

Essa evidência confirma operação automática diária, redundância entre relógios e proteção contra duplicidade no cenário observado. Como qualquer arquitetura dependente de serviços externos, a release não afirma disponibilidade matemática absoluta de provedores; ela documenta evidência real de produção e mantém os gates fail-safe existentes.`
if (!readme.includes('### Atualização operacional — 04/09/2026')) {
  if (!readme.includes(ptValidationMarker)) throw new Error('README PT validation marker not found')
  readme = readme.replace(ptValidationMarker, `${ptValidationSection}\n\n${ptValidationMarker}`)
}

const enValidationMarker = '### Operational update — 2026-09-03'
const enValidationSection = `### Operational update — 2026-09-04

Version 1.1.8 records the 2026-09-04 production validation. The daily edition reached \`completed\`, \`Dashboard-Monitoramento-04-09-2026.html\` was persisted, the public \`/hoje\` alias pointed to the same date, and Instagram completed with a non-empty \`platform_id\`.

The external Google Cloud Scheduler failsafe was proven again in production by run \`33860370126\`, a \`repository_dispatch\` execution in \`gcp-scheduler\` mode. The guard accepted the media target and the real execution step found September 4 already completed, then exited explicitly without another delivery. The downstream social job was skipped, preserving idempotency and avoiding a duplicate Story.

This evidence confirms daily automatic operation, independent-clock redundancy, and duplicate protection for the observed production scenario. As with any architecture that depends on external providers, the release does not claim mathematical provider availability; it documents live production evidence while preserving the existing fail-safe gates.`
if (!readme.includes('### Operational update — 2026-09-04')) {
  if (!readme.includes(enValidationMarker)) throw new Error('README EN validation marker not found')
  readme = readme.replace(enValidationMarker, `${enValidationSection}\n\n${enValidationMarker}`)
}

fs.writeFileSync('README.md', readme, 'utf8')
