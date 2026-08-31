# Scheduler Chaos QA Design — Monitoramento de Mídia

## Objetivo
Criar um gate de QA de chaos engineering que prove resiliência operacional do monitoramento diário mesmo quando o scheduler do GitHub atrasa, não cria eventos, cria eventos duplicados, há concorrência, falha de persistência, falha parcial de envio, Pages atrasado ou falha do publicador social.

## Princípios
- America/Sao_Paulo é a referência temporal autoritativa.
- O estado persistido é a fonte de verdade para idempotência.
- Nenhum teste de caos pode duplicar e-mail, dashboard ou Story em produção.
- Testes devem usar dry-run, mocks, fixtures ou data já concluída quando houver risco de efeito colateral real.
- Nenhuma release é publicada com cenário FAIL.
- O objetivo de "100%" significa 100% dos cenários definidos neste gate aprovados; indisponibilidade matemática de serviços externos não pode ser eliminada.

## Cenários obrigatórios
1. Nenhum evento `schedule` criado pelo GitHub.
2. Evento `schedule` criado com atraso extremo.
3. Dois ou mais gatilhos simultâneos para a mesma data.
4. Gatilho externo enquanto run relevante está queued/in_progress.
5. Gatilho externo após edição já completed.
6. Marcador de recuperação válido, inválido, desatualizado e duplicado.
7. Falha do Gemini antes de qualquer envio.
8. Falha do Gemini após estado parcial.
9. Falha SMTP antes do primeiro destinatário.
10. Falha SMTP após envio parcial.
11. Falha ao persistir `state/daily-executions.json`.
12. Conflito/non-fast-forward no push de estado.
13. Falha de checkout/sync de `main`.
14. GitHub Pages atrasado ou retornando edição anterior.
15. HTTP redirect/cache da URL `/hoje`.
16. Falha no `repository_dispatch` do publicador social.
17. Instagram incompleto sem `platform_id`.
18. Instagram completed com `platform_id`: recuperação deve ser bloqueada.
19. Falha temporária do controlador externo: ele permanece habilitado.
20. Recuperação posterior ao restabelecimento do GitHub sem duplicidade.

## Gate de aprovação
PASS somente quando:
- suíte unitária e integração = 0 falhas;
- TypeScript/build/lint/YAML = 0 falhas;
- testes de chaos = 100% PASS;
- execução concorrente preserva single-delivery;
- recuperação de estado parcial envia somente pendentes;
- Pages confirma a data corrente com cache-busting e redirects;
- publicação social concluída uma única vez com `platform_id`;
- nenhum segredo ou dado sensível exposto;
- README e release notes descrevem a arquitetura final e evidências.

## Estratégia de execução
Implementar harness determinístico de chaos com relógio controlado e mocks para scheduler, APIs e persistência. Adicionar testes de regressão para cada defeito encontrado. Executar ciclo red-green: falha reproduzida, correção mínima, suíte completa novamente. Repetir até não restar FAIL.

## Critério de release
A nova release somente será criada após execução fresca do gate completo e verificação independente do estado final do repositório e do serviço público.