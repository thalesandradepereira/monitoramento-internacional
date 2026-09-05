# Postmortem — 05/09/2026 — ausência recorrente de gatilhos automáticos

## Resumo executivo

Em 05/09/2026, os repositórios `monitoramento-internacional` e `monitoramento-social-publisher` não receberam nenhum run `schedule` do GitHub Actions na janela matinal observada. A falha ocorreu antes da execução do pipeline: não houve job principal para falhar.

O desenho anterior possuía um failsafe independente no Google Cloud Scheduler, porém o provisionamento versionado em `infra/gcp-scheduler-relay/deploy.sh` estava restrito a duas oportunidades tardias por alvo: mídia às 06:41/06:51 e publisher às 05:41/05:51 em `America/Sao_Paulo`. Isso deixava uma janela excessivamente longa dependente do scheduler do GitHub.

A correção amplia o relógio externo para uma malha sobreposta à janela de recuperação:

- mídia: `11,41 3-6 * * *` — 03:11, 03:41, 04:11, 04:41, 05:11, 05:41, 06:11 e 06:41;
- publisher: `21,51 3-6 * * *` — 03:21, 03:51, 04:21, 04:51, 05:21, 05:51, 06:21 e 06:51.

O publisher fica defasado em 10 minutos em relação à mídia. Todas as ativações continuam protegidas por idempotência diária, validação do target/job/timezone e OIDC.

## Evidências

- Em 05/09/2026 não havia run `schedule` no repositório de mídia durante a investigação.
- Em 05/09/2026 não havia run `schedule` no repositório social durante a investigação.
- O teste RED do novo contrato falhou no run `33955666834` porque o script ainda continha apenas `41,51 6 * * *` e `41,51 5 * * *`.
- Após a correção, o gate completo passou no run `33955788944`.
- O gate validou suíte completa, `npm audit`, TypeScript, Worker, relay GCP, sintaxe Bash, build Docker, YAML e whitespace.

## Causa raiz

A causa operacional comum é a ausência de criação dos eventos `schedule` pelo GitHub Actions. Como mídia e publicação usam o mesmo provedor de agendamento, essa camada era um domínio de falha compartilhado.

A causa arquitetural que permitiu recorrência foi depender do Google Cloud apenas como contingência tardia, em vez de fazê-lo participar da janela de recuperação desde cedo.

## Correção

O `deploy.sh` foi alterado para sobrepor o Google Cloud Scheduler à janela de recuperação. O mecanismo continua idempotente: reexecutar o deploy atualiza os dois jobs existentes, sem criar novos jobs paralelos.

## Limite explícito

Esta correção remove o GitHub Actions `schedule` como relógio único, mas não transforma o GitHub Actions em um executor independente. Uma indisponibilidade completa do plano de execução do GitHub ainda pode impedir um `repository_dispatch` externo de criar jobs. Eliminar esse domínio residual exigiria mover também a execução do pipeline para outro executor, como Cloud Run Jobs, não apenas o relógio.

## Implantação live

O código e os testes do repositório estão corrigidos. A nova cadência só passa a existir no ambiente Google Cloud real após reexecutar `infra/gcp-scheduler-relay/deploy.sh` com as credenciais/projeto de produção e confirmar os schedules ativos no Cloud Scheduler. Sem essa evidência live, o repositório está pronto, mas o ambiente externo não deve ser declarado atualizado.
