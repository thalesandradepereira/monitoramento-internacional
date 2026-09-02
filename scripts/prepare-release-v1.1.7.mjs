import fs from 'node:fs'

const VERSION = '1.1.7'

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
readme = readme.replace('**Versão / Version:** 1.1.6', '**Versão / Version:** 1.1.7')

const ptMarker = '### Atualização operacional — 31/08/2026'
const ptSection = `### Atualização operacional — 02/09/2026

Em 02/09/2026, a edição diária não iniciou pelos gatilhos automáticos esperados na janela primária. O controlador externo recuperou a produção às 05:11 BRT pelo marcador idempotente \`ops/recover-media.txt\`; a edição foi concluída e publicada sem duplicação. A v1.1.7 trata o incidente como falha de materialização de gatilho, e não como falha do pipeline já iniciado.

A malha diária foi reforçada para reduzir dependência de um único evento: o workflow principal possui quatro oportunidades em \`02:17\`, \`02:47\`, \`03:17\` e \`03:47\`; o watchdog independente possui seis oportunidades em \`04:29\`, \`04:59\`, \`05:29\`, \`05:59\`, \`06:29\` e \`06:59\`. Todas usam \`America/Sao_Paulo\`, compartilham a mesma \`concurrency\` e dependem da idempotência diária para transformar disparos posteriores em no-op quando a edição já está \`completed\`.

O provisionamento do Google Cloud também foi endurecido no código para uma cadência de recuperação de 30 minutos entre 03:11 e 06:41 BRT (\`11,41 3-6 * * *\`), mantendo retry do Cloud Scheduler e \`repository_dispatch: gcp_scheduler\`. Essa alteração de infraestrutura passa a valer no ambiente Google Cloud quando o script idempotente \`infra/gcp-scheduler-relay/deploy.sh\` for reaplicado; a camada GCP já existente continua sendo um relógio externo diário até esse redeploy.

O TDD comprovou a regressão: o teste novo falhou antes da implementação no run \`33615858817\`. Depois do hardening, o gate final passou no run \`33616253278\`, cobrindo suíte completa, npm audit, TypeScript, Worker, relay GCP, sintaxe do deploy, build Docker, YAML e whitespace. Os testes existentes continuam cobrindo perda/atraso de scheduler, idempotência, concorrência, D1 fail-closed, falhas SMTP, Gemini/RSS transitórios, dispatch GCP inválido/stale e publicação social com \`/hoje\` stale.

Os crons usam \`* * *\` para dia do mês, mês e dia da semana, portanto estão configurados para execução automática **todos os dias**. Nenhum provedor externo oferece garantia matemática de 100% de disponibilidade; a garantia de engenharia desta versão é que não há restrição de calendário e existem múltiplas oportunidades automáticas, com relógio externo e recuperação idempotente.`
if (!readme.includes('### Atualização operacional — 02/09/2026')) {
  if (!readme.includes(ptMarker)) throw new Error('README PT marker not found')
  readme = readme.replace(ptMarker, `${ptSection}\n\n${ptMarker}`)
}

const enMarker = '### Operational update — 2026-08-31'
const enSection = `### Operational update — 2026-09-02

On 2026-09-02, the daily edition did not start through the automatic triggers expected in the primary window. The external controller recovered production at 05:11 BRT through the idempotent \`ops/recover-media.txt\` marker; the edition completed and published without duplication. Version 1.1.7 treats the incident as a trigger-materialization failure, not as a failure inside an already-started pipeline.

The daily trigger mesh now has four primary opportunities at \`02:17\`, \`02:47\`, \`03:17\`, and \`03:47\`, plus six independent-watchdog opportunities at \`04:29\`, \`04:59\`, \`05:29\`, \`05:59\`, \`06:29\`, and \`06:59\`. All use \`America/Sao_Paulo\`, share the same concurrency group, and rely on daily idempotence so later triggers become no-ops after the edition is \`completed\`.

The Google Cloud provisioning code is also hardened to a 30-minute media recovery cadence from 03:11 through 06:41 BRT (\`11,41 3-6 * * *\`), preserving Cloud Scheduler retries and \`repository_dispatch: gcp_scheduler\`. This infrastructure change becomes effective in Google Cloud when the idempotent \`infra/gcp-scheduler-relay/deploy.sh\` script is reapplied; the already-active GCP layer remains a daily external clock until that redeploy.

TDD proved the regression first: the new test failed before implementation in run \`33615858817\`. After hardening, the final gate passed in run \`33616253278\`, covering the complete suite, npm audit, TypeScript, Worker, GCP relay, deploy syntax, Docker build, YAML, and whitespace. Existing tests continue to cover scheduler delay/loss, idempotence, concurrency, D1 fail-closed behavior, SMTP failures, transient Gemini/RSS failures, invalid/stale GCP dispatches, and social publication with a stale \`/hoje\` alias.

The cron expressions use \`* * *\` for day-of-month, month, and day-of-week, so they are configured for automatic execution **every day**. No external provider offers a mathematical 100% availability guarantee; this version guarantees the calendar configuration and redundant automatic opportunities, backed by an external clock and idempotent recovery.`
if (!readme.includes('### Operational update — 2026-09-02')) {
  if (!readme.includes(enMarker)) throw new Error('README EN marker not found')
  readme = readme.replace(enMarker, `${enSection}\n\n${enMarker}`)
}

readme = readme.replace(
  'GH1[GitHub schedule<br/>02:17 / 03:17]',
  'GH1[GitHub schedule<br/>02:17 / 02:47 / 03:17 / 03:47]'
)
readme = readme.replace(
  'GH2[GitHub watchdog<br/>04:29 / 05:29 / 06:29]',
  'GH2[GitHub watchdog<br/>04:29 / 04:59 / 05:29 / 05:59 / 06:29 / 06:59]'
)
readme = readme.replace(
  '| GitHub principal | 02:17, 03:17 | execução primária + recuperação |',
  '| GitHub principal | 02:17, 02:47, 03:17, 03:47 | quatro oportunidades primárias idempotentes |'
)
readme = readme.replace(
  '| Watchdog GitHub independente | 04:29, 05:29, 06:29 | contingência contra perda do workflow principal |',
  '| Watchdog GitHub independente | 04:29, 04:59, 05:29, 05:59, 06:29, 06:59 | contingência idempotente em workflow separado |'
)
readme = readme.replace(
  '| Google Cloud Scheduler | 06:41, 06:51 | relógio externo depois das contingências GitHub |',
  '| Google Cloud Scheduler | produção existente: 06:41, 06:51; deploy v1.1.7: 03:11–06:41 a cada 30 min | relógio externo; nova cadência requer redeploy do script GCP |'
)

fs.writeFileSync('README.md', readme, 'utf8')
