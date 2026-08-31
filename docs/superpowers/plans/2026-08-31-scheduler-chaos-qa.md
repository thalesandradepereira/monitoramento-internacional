# Scheduler Chaos QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Monitoramento de Mídia em um sistema validado por chaos QA contra falhas de scheduler, concorrência, persistência, entrega, Pages e publicação social.

**Architecture:** Adicionar um harness determinístico de chaos em `tests/` com relógio controlado e mocks, ampliar testes existentes de `dailyExecution`, `run`, `gcpSchedulerDispatch`, recovery marker e social dispatch, e endurecer o workflow apenas onde um teste de regressão demonstrar falha. O gate final executa testes, TypeScript, YAML, segurança e validações externas sem duplicar produção.

**Tech Stack:** Node 22, TypeScript, `node:test`, tsx, GitHub Actions, Google Cloud Scheduler/Cloud Run, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-31-scheduler-chaos-qa-design.md`

## Global Constraints
- Timezone: `America/Sao_Paulo`.
- Zero duplicidade de e-mail, dashboard ou Story.
- Nenhum teste destrutivo em produção.
- Release bloqueada enquanto houver qualquer FAIL.

---

### Task 1: Harness de chaos do scheduler

**Files:**
- Create: `tests/scheduler-chaos.test.ts`
- Modify: `tests/dailyExecution.test.ts`
- Modify: `tests/run.test.ts`

**Interfaces:**
- Consumes: estado diário e lógica de execução existente.
- Produces: cenários determinísticos de ausência, atraso, duplicidade e concorrência do scheduler.

- [ ] **Step 1: Write failing tests** cobrindo cron ausente, cron 6h atrasado, dois gatilhos simultâneos, run em andamento e data já completed.
- [ ] **Step 2: Run** `npm test` e confirmar que ao menos um cenário novo falha antes da correção.
- [ ] **Step 3: Implement minimal hardening** somente nos módulos responsáveis por idempotência/lock/estado que o teste apontar.
- [ ] **Step 4: Run** `npm test` e `npx tsc --noEmit`; esperado 0 falhas.
- [ ] **Step 5: Commit** `test: add scheduler chaos coverage`.

### Task 2: Falhas parciais e recuperação

**Files:**
- Create: `tests/recovery-chaos.test.ts`
- Modify: `tests/email.test.ts`
- Modify: `tests/gcpSchedulerDispatch.test.ts`
- Modify: `tests/scripts/recovery-marker.test.mjs` se existir; caso o teste equivalente esteja em outro arquivo, usar o arquivo real descoberto antes da edição.

**Interfaces:**
- Consumes: envio SMTP, estado persistido, recovery marker e dispatch GCP.
- Produces: garantia de checkpoint e retomada somente dos pendentes.

- [ ] **Step 1:** Criar testes para Gemini/SMTP falhando antes e depois de progresso parcial, push non-fast-forward, marker inválido/desatualizado/duplicado e dispatch GCP inválido.
- [ ] **Step 2:** Executar `npm test` e registrar os FAIL reais.
- [ ] **Step 3:** Corrigir cada FAIL com alteração mínima e teste de regressão red-green.
- [ ] **Step 4:** Executar `npm test && npx tsc --noEmit`.
- [ ] **Step 5:** Commit `fix: harden partial recovery paths`.

### Task 3: Pages e social chaos

**Files:**
- Create: `tests/pages-social-chaos.test.mjs`
- Modify: `tests/socialDispatch.test.mjs`
- Modify: `scripts/dispatch-social-publisher.mjs` somente se um FAIL for reproduzido.

**Interfaces:**
- Consumes: dashboard publicado, `/hoje`, repository dispatch e estado social.
- Produces: bloqueio contra Pages stale e Story duplicado.

- [ ] **Step 1:** Testar Pages stale, redirect/cache, publisher indisponível, Instagram sem `platform_id` e Instagram já completed.
- [ ] **Step 2:** Rodar `npm test`; registrar FAIL.
- [ ] **Step 3:** Aplicar correções mínimas.
- [ ] **Step 4:** Rodar `npm test && npx tsc --noEmit`.
- [ ] **Step 5:** Commit `test: cover pages and social chaos`.

### Task 4: Gate completo e release

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: gate obrigatório de chaos QA e documentação/release.

- [ ] **Step 1:** Integrar `npm test`, `npx tsc --noEmit`, auditoria de dependências e validação YAML ao CI existente, sem remover gates atuais.
- [ ] **Step 2:** Executar suite completa fresca e confirmar 0 FAIL.
- [ ] **Step 3:** Executar validação operacional não destrutiva usando data já completed para provar idempotência.
- [ ] **Step 4:** Atualizar README com matriz de chaos, evidências e arquitetura final; incrementar versão patch.
- [ ] **Step 5:** Criar release somente após CI final `completed/success` e revalidar a release publicada.

## Self-review
- Cobertura do spec: scheduler, concorrência, recuperação, APIs, SMTP, persistência, Pages, social, controlador externo e release gate estão mapeados.
- Sem placeholders operacionais; qualquer caminho citado condicionalmente deve ser resolvido por leitura do repositório antes da edição.
- Toda correção exige teste red-green e rerun completo.