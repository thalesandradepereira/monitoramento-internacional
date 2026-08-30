import fs from 'node:fs';

const VERSION = '1.1.5';

function updateJson(path, mutate) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  mutate(data);
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

updateJson('package.json', (pkg) => {
  pkg.version = VERSION;
});

updateJson('package-lock.json', (lock) => {
  lock.version = VERSION;
  if (!lock.packages?.['']) throw new Error('package-lock root package missing');
  lock.packages[''].version = VERSION;
});

const readmePath = 'README.md';
let text = fs.readFileSync(readmePath, 'utf8');
text = text.replace('**Versão / Version:** 1.1.4', '**Versão / Version:** 1.1.5');

const ptMarker = '### Atualização operacional — 29/08/2026';
const ptSection = `### Atualização operacional — 30/08/2026

O incidente de 30/08/2026 confirmou que eventos \`schedule\` do GitHub Actions podem sofrer atraso severo: o run agendado \`33306554202\` só foi criado às 07:28 BRT. A edição já havia sido recuperada de forma idempotente pelo controlador externo no run \`33303070482\`, concluída às 06:12 BRT com \`attempted=6\`, \`sent=6\`, \`failed=0\`.

A causa raiz foi classificada como indisponibilidade/atraso do relógio externo do GitHub, não como falha do pipeline, Gemini, SMTP ou persistência. O run tardio comprovou a proteção: encontrou 30/08 como \`completed\` e encerrou sem novo envio.

A postura de produção da v1.1.5 combina GitHub principal, watchdog, Google Cloud Scheduler/Cloud Run e controlador externo de produção. O controlador verifica estado diário, dashboard, \`/hoje\`, GitHub Pages e Instagram antes de qualquer recuperação, nunca cria novo disparo quando já existe run relevante \`queued\`/\`in_progress\` e não se desativa por falha transitória de ferramenta.

O postmortem completo e as evidências estão em \`POSTMORTEM-2026-08-30.md\`.`;
if (!text.includes('### Atualização operacional — 30/08/2026')) {
  if (!text.includes(ptMarker)) throw new Error('README PT marker not found');
  text = text.replace(ptMarker, `${ptSection}\n\n${ptMarker}`);
}

const enMarker = '### Operational update — 2026-08-29';
const enSection = `### Operational update — 2026-08-30

The 2026-08-30 incident confirmed that GitHub Actions \`schedule\` events can be severely delayed: scheduled run \`33306554202\` was only created at 07:28 BRT. The daily edition had already been recovered idempotently by the external production controller through run \`33303070482\`, completing at 06:12 BRT with \`attempted=6\`, \`sent=6\`, \`failed=0\`.

Root cause was classified as delay/unavailability of GitHub's external scheduling clock, not a pipeline, Gemini, SMTP, or persistence failure. The late scheduled run proved the guard by finding 2026-08-30 already \`completed\` and exiting without another delivery.

The v1.1.5 production posture combines the primary GitHub workflow, independent watchdog, Google Cloud Scheduler/Cloud Run, and the external production controller. The controller validates daily state, dashboard, \`/hoje\`, GitHub Pages, and Instagram before any recovery; it never creates another trigger while a relevant run is \`queued\`/\`in_progress\`, and it is not disabled by transient tool failures.

The full postmortem and evidence are documented in \`POSTMORTEM-2026-08-30.md\`.`;
if (!text.includes('### Operational update — 2026-08-30')) {
  if (!text.includes(enMarker)) throw new Error('README EN marker not found');
  text = text.replace(enMarker, `${enSection}\n\n${enMarker}`);
}

const oldPt = 'A versão 1.1.4 consolida as correções do failsafe Google Cloud, a validação real Scheduler → Cloud Run → GitHub, a proteção de Force Run e a prova de idempotência sem duplicidade em produção.';
if (!text.includes('A versão 1.1.5 formaliza o fechamento')) {
  if (!text.includes(oldPt)) throw new Error('README PT release policy marker not found');
  text = text.replace(oldPt, `A versão 1.1.5 formaliza o fechamento do incidente de 30/08/2026, adiciona o controlador externo à postura operacional documentada e registra o QA pós-incidente com prova real de idempotência.\n\n${oldPt}`);
}

const oldEn = 'This repository follows Semantic Versioning. Version **1.1.4** consolidates the Google Cloud failsafe fixes, live Scheduler → Cloud Run → GitHub validation, bounded Force Run handling, and production idempotency evidence with no duplicate effects.';
if (!text.includes('Version **1.1.5** formalizes closure')) {
  if (!text.includes(oldEn)) throw new Error('README EN release policy marker not found');
  text = text.replace(oldEn, "This repository follows Semantic Versioning. Version **1.1.5** formalizes closure of the 2026-08-30 incident, documents the external production controller, and records post-incident QA with live idempotency evidence. Version **1.1.4** consolidated the Google Cloud failsafe fixes, live Scheduler → Cloud Run → GitHub validation, bounded Force Run handling, and production idempotency evidence with no duplicate effects.");
}

fs.writeFileSync(readmePath, text, 'utf8');
