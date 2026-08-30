# Postmortem de Produção — 30/08/2026

## Resumo executivo

Em 30/08/2026, a edição diária do Monitoramento de Mídia Internacional não iniciou no horário esperado pelos eventos `schedule` do GitHub Actions. O controlador externo detectou que não havia registro `completed` para a data operacional, confirmou ausência de execução relevante `queued`/`in_progress` e acionou uma única recuperação idempotente por `ops/recover-media.txt`.

A recuperação concluiu com sucesso, publicou o dashboard de 30/08/2026, atualizou `/hoje`, enviou 6/6 e-mails sem falhas e acionou o publicador social. Posteriormente, o próprio evento `schedule` do GitHub foi criado com atraso severo e executou às 07:28 BRT; a proteção de idempotência reconheceu o dia como já concluído e encerrou sem novo envio.

## Causa raiz

**Causa raiz confirmada:** atraso severo na materialização/execução do evento `schedule` do GitHub Actions, serviço externo ao código da aplicação.

Evidência:

- workflow agendado: `Disparo Monitoramento Mídia Internacional`;
- run agendado tardio: `33306554202`;
- `created_at`: `2026-08-30T10:28:15Z`, equivalente a 07:28:15 em `America/Sao_Paulo`;
- no run tardio, `npm ci`, TypeScript e `npm run once` concluíram com sucesso;
- log de idempotência: `Envio real de 2026-08-30 (America/Sao_Paulo) já registrado como concluído. Encerrando sem novo envio.`

Isso exclui como causa primária falha de Gemini, SMTP, Cloudflare D1, renderização do dashboard ou persistência do estado.

## Recuperação executada

O controlador externo atualizou `ops/recover-media.txt` uma única vez com o marcador de recuperação da data 2026-08-30.

- commit de recuperação: `6e49704e39ef30f90a238291fb8019ad3391b8bf`;
- workflow de recuperação: run `33303070482`;
- marcador validado antes da execução;
- destinatários D1 pré-validados: 6;
- e-mails: `attempted=6`, `sent=6`, `failed=0`;
- dashboard: `docs/Dashboard-Monitoramento-30-08-2026.html`;
- alias: `docs/hoje/index.html` atualizado para 30/08/2026;
- estado final: `completed`.

O job social do run de recuperação também concluiu com sucesso. O estado do publicador registrou a publicação de 30/08/2026 como concluída com `platform_id`, preservando uma única tentativa/publicação.

## Controles preventivos em produção

A arquitetura não depende mais de um único relógio:

1. workflow GitHub principal — 02:17 e 03:17 BRT;
2. watchdog GitHub independente — 04:29, 05:29 e 06:29 BRT;
3. Google Cloud Scheduler → Cloud Run privado → `repository_dispatch` — failsafe externo;
4. controlador externo de produção — valida estado, artefato, `/hoje`, Pages e Instagram antes de decidir qualquer recuperação;
5. idempotência diária persistida — impede repetição de edição/e-mail/Story após `completed`;
6. `concurrency` compartilhada — impede duas execuções reais concorrentes do pipeline principal.

O controlador externo não deve ser desativado por falhas transitórias de ferramenta ou de escrita; nesses casos preserva a próxima verificação e não cria disparo duplicado.

## QA pós-incidente

Gates obrigatórios para v1.1.5:

- `npm ci`;
- `npm audit --audit-level=moderate`;
- suíte automatizada completa (`npm test`);
- `npx tsc --noEmit`;
- sintaxe do Worker;
- testes do relay Google Cloud;
- validação de sintaxe do relay e do script de deploy;
- build Docker do relay;
- validação YAML dos workflows;
- validação do marcador de recuperação;
- existência do dashboard da data da release;
- `/hoje` apontando para a mesma data;
- GitHub Pages acessível com cache-busting;
- ausência de `recipients.txt`;
- releases históricas sanitizadas presentes;
- prova de idempotência em produção pelo run tardio `33306554202`.

A release só deve ser criada se todos os gates executáveis passarem.

## Risco residual

Não é possível garantir disponibilidade matemática de 100% para provedores externos. O objetivo operacional atingido é eliminar o GitHub `schedule` como ponto único de falha e assegurar detecção/recuperação independente e idempotente. Falhas simultâneas de múltiplos provedores continuam possíveis, mas passam a ser detectáveis e não devem provocar duplicidade de efeitos externos.

**Classificação pós-correção:** Production Approved, condicionado ao gate verde da v1.1.5.

**Made by TAP**
