# 🌎 Monitoramento Mídia Internacional | Global Media Monitoring

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)
[![CI](https://github.com/thalesandradepereira/monitoramento-internacional/actions/workflows/ci.yml/badge.svg)](https://github.com/thalesandradepereira/monitoramento-internacional/actions/workflows/ci.yml)

Pipeline automatizado que coleta notícias internacionais, seleciona e resume os temas mais relevantes com IA, produz conteúdo em português e inglês, gera um dashboard HTML interativo e envia e-mails individualizados aos destinatários ativos armazenados no Cloudflare D1.

### Acessos rápidos

| Recurso | Link |
| --- | --- |
| Edição mais recente | [Abrir `/hoje`](https://thalesandradepereira.github.io/monitoramento-internacional/hoje) |
| Acervo de dashboards | [GitHub Pages](https://thalesandradepereira.github.io/monitoramento-internacional/) |
| Execuções do monitoramento | [GitHub Actions](https://github.com/thalesandradepereira/monitoramento-internacional/actions/workflows/monitoramento.yml) |
| Validação contínua | [Workflow de CI](https://github.com/thalesandradepereira/monitoramento-internacional/actions/workflows/ci.yml) |

## Estado operacional

| Item | Configuração atual |
| --- | --- |
| Identidade | **Monitoramento Mídia Internacional \| Global Media Monitoring** |
| Execução agendada | Principal às **02:17 em Brasília**, com recuperação idempotente às **03:17** |
| Execução manual | `dry_run=true` por padrão |
| Fonte editorial | Pesquisas RSS localizadas do Google News |
| Cobertura | 10 países, janela padrão de 24 horas |
| Processamento de IA | Triagem em lotes, seleção por país, resumo PT-BR e tradução EN-US |
| Estratégia de modelos | Flash-Lite nas etapas em volume e Gemini 3.6 Flash na síntese editorial |
| API de IA | Google GenAI Interactions API, saída JSON estruturada e `store=false` |
| Proteção de cota | Chamadas sequenciais, intervalo preventivo de 13 segundos e retentativas seletivas |
| Destinatários de produção | Cloudflare D1, consultado por endpoint privado autenticado |
| Dashboard | Arquivos HTML versionados em `docs/` e publicados pelo GitHub Pages |
| Link permanente | `/hoje` redireciona sem cache para a edição diária mais recente |
| Envio | SMTP com mensagem individual por destinatário |
| Integração social | Disparo opcional para repositório privado somente após validar o dashboard publicado |
| CI | Testes e validações estáticas em pull requests e execução manual |

> O repositório é público. Os dashboards publicados em GitHub Pages também são públicos. Os endereços dos destinatários não devem ser armazenados em arquivos, commits, logs ou artefatos públicos.

## Fluxo real de produção

```mermaid
flowchart TD
    A[GitHub Actions: schedule ou execução manual] --> B{DRY_RUN?}
    B -- Não --> C[Sincronizar main e validar idempotência diária]
    C --> D[Consultar e pré-validar destinatários no D1]
    D --> E[Registrar in_progress e persistir no Git]
    B -- Sim --> F[Coletar RSS do Google News]
    E --> F
    F --> G[Filtrar janela temporal e deduplicar a execução]
    G --> H[Flash-Lite: triagem Map em lotes]
    H --> I[Gemini 3.6 Flash: síntese por país]
    I --> J[Flash-Lite: tradução EN-US]
    J --> K[Renderizar dashboard e e-mail]
    K --> L{DRY_RUN?}
    L -- Sim --> M[Validar em memória, sem envio ou publicação]
    L -- Não --> N[Salvar HTML em docs/]
    N --> O[Enviar e-mails individualizados]
    O --> P[Atualizar histórico local e estado final]
    P --> Q[Commit e push de docs/ e state/]
    Q --> R[GitHub Pages processa e publica o dashboard]
```

### Comportamento fail-closed

Uma execução real é interrompida antes da coleta quando a lista privada de destinatários não pode ser carregada ou validada. O pipeline não usa `recipients.txt`, `DEST_EMAIL` ou outra fonte como fallback automático quando `RECIPIENTS_SOURCE=d1` está selecionado.

## Cobertura editorial

As fontes configuradas em `src/sources.ts` são pesquisas RSS do Google News adaptadas ao idioma e à região de cada país:

- Brasil
- Estados Unidos
- França
- Inglaterra
- Espanha
- Alemanha
- Japão
- China
- Índia
- Portugal

As consultas de origem cobrem economia, ciência, tecnologia, esportes, conflitos e política. Na etapa de IA, a seleção editorial prioriza tecnologia, ciência e assuntos em alta.

> O projeto não mantém integrações diretas ou contratos com veículos específicos. A disponibilidade e o conteúdo dependem dos feeds de pesquisa do Google News e das fontes indexadas por ele.

## Processamento de notícias

1. **Coleta concorrente:** lê os 10 feeds com timeout individual.
2. **Janela temporal:** elimina itens fora de `JANELA_HORAS`, cujo padrão é 24 horas.
3. **Deduplicação:** normaliza títulos, remove repetições do ciclo e consulta o histórico persistido das últimas 500 notícias enviadas.
4. **Decodificação de links:** tenta converter URLs intermediárias do Google News em links diretos, com concorrência limitada.
5. **Triagem Map:** envia lotes de até 200 itens ao Gemini 3.5 Flash-Lite para identificar candidatos por país.
6. **Reduce por país:** usa Gemini 3.6 Flash para escolher até 8 notícias por país, traduzir os títulos para PT-BR e gerar resumos e categorias.
7. **Tradução:** usa Gemini 3.5 Flash-Lite para criar a versão equivalente em inglês.
8. **Renderização:** produz e-mail e dashboard bilíngues.

As três etapas usam modelos estáveis configuráveis separadamente. `GEMINI_MODEL` continua disponível como substituição global por compatibilidade.

### Estratégia de IA e controle de cota

| Etapa | Modelo padrão | Unidade de processamento | Objetivo operacional |
| --- | --- | --- | --- |
| Triagem | `gemini-3.5-flash-lite` | Até 200 títulos por lote | Reduzir custo e chamadas ao modelo editorial |
| Síntese | `gemini-3.6-flash` | Um país por chamada, até 8 itens | Concentrar o modelo de maior qualidade na decisão editorial |
| Tradução | `gemini-3.5-flash-lite` | Até 15 tópicos por lote | Produzir EN-US com menor consumo de cota |

Todas as chamadas passam por `src/geminiHelper.ts`, que:

- utiliza a **Interactions API** do SDK `@google/genai`;
- envia `store=false`, evitando armazenamento da interação pelo recurso da API;
- solicita `application/json` com schema estruturado;
- remove do JSON Schema os campos ainda incompatíveis com a API;
- valida novamente a resposta localmente com schemas Zod estritos;
- mantém intervalo preventivo de **13 segundos** entre chamadas;
- tenta novamente somente para HTTP `408`, `429`, `500`, `502`, `503` e `504`;
- respeita o tempo de espera informado pela API e usa espera ampliada em respostas `429`.

Essa estratégia reduz a probabilidade de estouro de RPM e RPD, mas não transforma a cota gratuita em capacidade garantida. Um `dry_run` também chama a IA e, portanto, consome cota mesmo sem publicar ou enviar e-mails.

### Comportamento diante de falhas da IA

- falha em um lote de triagem é registrada e os demais lotes continuam;
- falha na síntese de um país não invalida automaticamente os países já processados;
- se nenhum tópico PT-BR for produzido, a execução termina como falha e não envia conteúdo vazio;
- falha de tradução em um lote reutiliza o conteúdo em português para preservar a quantidade e os links;
- respostas que alterem `fonte` ou `link`, violem o schema ou contenham JSON inválido são rejeitadas;
- falhas transitórias são retentadas até o limite configurado pelo helper.

## Saídas geradas

### Dashboard interativo

Cada execução real com notícias cria:

```text
Dashboard-Monitoramento-DD-MM-AAAA.html
```

O dashboard contém:

- identidade **Monitoramento Mídia Internacional | Global Media Monitoring**;
- data operacional;
- busca por palavra-chave;
- seleção de idioma;
- filtros por país e categoria;
- cartões com título, resumo, fonte e link original.

Os arquivos ficam em `docs/` e são acessados pelo GitHub Pages:

```text
https://thalesandradepereira.github.io/monitoramento-internacional/
```

O endereço permanente abaixo é atualizado em toda execução real que cria um novo dashboard:

```text
https://thalesandradepereira.github.io/monitoramento-internacional/hoje
```

`docs/hoje/index.html` valida o padrão do nome do arquivo, desabilita cache, declara a URL canônica e redireciona para a edição correspondente à data operacional.

O dashboard não carrega fontes, scripts ou telemetria de terceiros. Os dados incorporados no HTML são serializados de modo seguro e o documento aplica uma política de segurança de conteúdo com nonce.

### E-mail

O envio é realizado individualmente para cada destinatário. A mensagem contém:

- assunto bilíngue com a data;
- botão para o dashboard;
- bloco completo em português;
- bloco completo em inglês;
- link de indicação;
- link individual de descadastro assinado por HMAC.

Os logs exibem somente endereços mascarados e um relatório agregado de tentativas, sucessos e falhas.

### Publicador social privado

Quando a execução corrente realmente cria um dashboard, o job `disparar-publicacao-social`:

1. espera o GitHub Pages disponibilizar exatamente o HTML da data corrente;
2. valida status HTTP, `Content-Type`, tamanho mínimo e presença da data;
3. confirma que o estado persistido é `completed`;
4. compara data e nome do arquivo com os outputs do job que acabou de executar;
5. envia o evento `dashboard_published` para o repositório privado configurado.

O gatilho não é executado em `dry_run`, em execuções sem novo dashboard ou quando `dashboard_created` não é `true`. Se `SOCIAL_PUBLISHER_REPOSITORY` ou `SOCIAL_PUBLISHER_TOKEN` não estiver configurado, a integração permanece desativada sem afetar o monitoramento principal.

## Arquitetura

| Componente | Responsabilidade |
| --- | --- |
| `src/run.ts` | Orquestra o pipeline, o `dry_run`, a pré-validação de destinatários e a persistência operacional |
| `src/fetchNews.ts` | Coleta RSS, filtra a janela, deduplica e decodifica links |
| `src/summarize.ts` | Executa triagem e seleção qualitativa por país |
| `src/translate.ts` | Produz a versão em inglês |
| `src/geminiHelper.ts` | Interactions API, schema compatível, pacing e retentativas da IA |
| `src/history.ts` | Mantém o histórico deduplicado das últimas 500 notícias enviadas |
| `src/dashboard.ts` | Gera o dashboard HTML interativo |
| `src/branding.ts` | Aplica a identidade bilíngue ao dashboard |
| `src/todayAlias.ts` | Gera o redirecionamento seguro e sem cache de `/hoje` |
| `src/email.ts` | Renderiza e envia mensagens individuais por SMTP |
| `src/recipients.ts` | Carrega e valida destinatários, com produção em D1 |
| `src/dailyExecution.ts` | Controla idempotência diária e commits de estado |
| `scripts/dispatch-social-publisher.mjs` | Valida o Pages e aciona opcionalmente o publicador social privado |
| `worker/index.js` | Worker de inscrição, indicação, descadastro e API privada de destinatários |
| Cloudflare D1 | Armazena os destinatários e seus estados fora do GitHub |
| GitHub Actions | Executa o monitoramento e o CI |
| GitHub Pages | Publica os dashboards estáticos |

## Privacidade e segurança

### Dados públicos e privados

| Informação | Local | Visibilidade |
| --- | --- | --- |
| Código-fonte | GitHub | Pública |
| Dashboards e notícias processadas | GitHub Pages / `docs/` | Pública |
| Registro de execução diária | `state/daily-executions.json` | Público, sem dados pessoais |
| Destinatários ativos | Cloudflare D1 | Privada |
| Tokens, senhas e chaves | GitHub Actions Secrets / Worker Secrets | Privada |
| `recipients.txt` | GitHub | Arquivo público desativado, sem endereços |

### Controles implementados

- `dry_run=true` como padrão da execução manual;
- prevalidation da lista D1 antes de registrar `in_progress`;
- endpoint privado com `Authorization: Bearer`;
- HTTPS obrigatório na consulta de destinatários;
- timeout, validação de status HTTP, `Content-Type` e JSON;
- normalização, deduplicação e limite de destinatários;
- logs com e-mails mascarados;
- `Cache-Control: no-store` nos endpoints administrativos;
- comparação de tokens resistente a diferenças de tempo;
- links de descadastro assinados com HMAC-SHA256;
- inscrição pública somente por `POST`, sem reativação pública de endereços descadastrados;
- CSP com nonce e serialização segura dos dados incorporados no dashboard;
- links externos restritos a HTTP(S) e proteção contra `window.opener`;
- respostas estruturadas e validadas por schema nas chamadas à IA;
- Interactions API com `store=false`;
- higienização do schema enviado à API e validação Zod estrita após a geração;
- intervalo preventivo de 13 segundos, timeout e retentativas restritas a falhas transitórias do Gemini;
- exigência de cobertura mínima das fontes RSS;
- `concurrency` no GitHub Actions;
- idempotência persistente por data e fuso horário;
- bloqueio de reenvio automático após estado `completed`, `failed` ou incerto.

## Modos de execução

| Modo | Como inicia | `DRY_RUN` | Envia e-mail | Altera `docs/` | Registra execução real |
| --- | --- | --- | --- | --- | --- |
| Agendado | `schedule` do GitHub Actions | `false` | Sim | Sim | Sim |
| Manual padrão | `workflow_dispatch` | `true` | Não | Não | Não |
| Manual real | `workflow_dispatch` com `dry_run=false` | `false` | Sim | Sim | Sim |
| Local padrão | `npm run once` sem `DRY_RUN=false` | `true` | Não | Não | Não |

O workflow de produção está em `.github/workflows/monitoramento.yml` e usa uma execução principal e uma recuperação automática:

```yaml
schedule:
  - cron: '17 2 * * *'
    timezone: 'America/Sao_Paulo'
  - cron: '17 3 * * *'
    timezone: 'America/Sao_Paulo'
```

O workflow usa o timezone explícito do GitHub Actions. A segunda agenda recupera falhas transitórias ou um disparo não iniciado pela plataforma; a idempotência encerra sem reenviar quando o dia já está `completed`. Para a aplicação local, `CRON_EXPR=17 2 * * *` é interpretado com `TIMEZONE=America/Sao_Paulo`.

> O GitHub Actions pode iniciar alguns minutos depois do horário nominal devido à fila da plataforma.

> **Cota do Gemini:** 02:17 em Brasília ocorre antes da renovação diária observada no projeto, próxima das 04:00 no horário de Brasília. Evite execuções reais ou `dry_run` adicionais após a renovação do dia anterior quando for necessário preservar cota para o disparo agendado.

## Idempotência diária

O arquivo `state/daily-executions.json` mantém um único estado efetivo por data operacional e fuso:

- `in_progress`
- `completed`
- `failed`
- `dry_run`

Cada registro contém apenas data, horário, fuso, modo e contagens agregadas. Não contém e-mails, tokens ou senhas.

Antes de uma execução real no GitHub Actions, o pipeline atualiza a `main`, verifica o estado do dia e bloqueia duplicidades. O início e o resultado final são persistidos por commits automáticos.

## Operação e diagnóstico

| Verificação | Onde consultar | Resultado esperado |
| --- | --- | --- |
| Execução diária | Actions → `Disparo Monitoramento Mídia Internacional` | Job principal concluído com sucesso |
| Estado do dia | `state/daily-executions.json` | Registro `completed` para a data e o fuso |
| Dashboard versionado | `docs/Dashboard-Monitoramento-DD-MM-AAAA.html` | Arquivo presente na `main` |
| Link permanente | `/hoje` | Redirecionamento para o dashboard da data |
| Entregas | Logs mascarados do job | `failed=0` |
| Publicação social | Job `disparar-publicacao-social` | Evento enviado ou integração explicitamente desativada |

Em uma falha:

1. não execute novamente com `dry_run=false` sem consultar o estado persistido;
2. identifique primeiro se a origem foi RSS, Gemini, D1, SMTP, GitHub Pages ou o publicador social;
3. para Gemini `429`, aguarde a janela de cota em vez de iniciar várias execuções;
4. preserve os logs, mas nunca copie secrets ou endereços completos;
5. corrija a causa em branch e valide o CI antes de qualquer nova execução real.

## Instalação local

### Requisitos

- Git
- Node.js 20 ou 22
- npm
- credencial do Google Gemini para processar conteúdo
- credenciais SMTP para envio real
- acesso ao endpoint privado do D1 para uma execução real com `RECIPIENTS_SOURCE=d1`

### Preparação

```bash
git clone https://github.com/thalesandradepereira/monitoramento-internacional.git
cd monitoramento-internacional
npm ci
cp .env.example .env
```

Nunca envie o arquivo `.env` ao GitHub. Ele já está protegido pelo `.gitignore`.

### Dry run local

```bash
DRY_RUN=true EXECUTION_MODE=manual npm run once
```

O dry run pode coletar notícias, chamar a IA, gerar o dashboard em memória e validar o resultado. Ele não envia e-mails, não publica o dashboard, não atualiza o histórico e não registra a data como concluída.

### Servidor e cron locais

```bash
npm start
```

Esse comando inicia o Express e o `node-cron`. Como `DRY_RUN` é seguro por padrão, uma execução local sem `DRY_RUN=false` não deve enviar e-mails.

> `src/server.ts` ainda grava inscrições no arquivo local `recipients.txt`. Esse servidor é legado e não representa o cadastro de produção, que ocorre no Cloudflare Worker com D1.

### Execução real local

```bash
DRY_RUN=false \
EXECUTION_MODE=local \
RECIPIENTS_SOURCE=d1 \
RECIPIENTS_API_TOKEN='configure-localmente' \
npm run once
```

Use somente em uma operação intencional. Fora do GitHub Actions, os commits e pushes automáticos de estado não são executados; portanto, uma execução real local não é equivalente à rotina oficial de produção.

## Configuração

### Variáveis principais

| Variável | Finalidade | Padrão relevante |
| --- | --- | --- |
| `GEMINI_API_KEY` | Chave da IA | Obrigatória para processar conteúdo |
| `GEMINI_MODEL_SUMMARY` | Seleção e resumo editorial | `gemini-3.6-flash` |
| `GEMINI_MODEL_TRIAGE` | Triagem em grande volume | `gemini-3.5-flash-lite` |
| `GEMINI_MODEL_TRANSLATION` | Tradução em grande volume | `gemini-3.5-flash-lite` |
| `GEMINI_TIMEOUT_MS` | Timeout por chamada à IA | `120000` |
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Porta SMTP | `465` |
| `SMTP_SECURE` | TLS implícito | Ativo quando igual a `true` |
| `SMTP_USER` | Usuário/remetente SMTP | Sem padrão útil |
| `SMTP_PASS` | Senha ou app password | Sem padrão |
| `FROM_NAME` | Nome do remetente | `Monitoramento Mídia Internacional` |
| `DRY_RUN` | Bloqueia ações irreversíveis | Seguro por padrão; somente `false` envia |
| `EXECUTION_MODE` | `scheduled`, `manual` ou `local` | `local` |
| `CRON_EXPR` | Cron da aplicação local | `17 2 * * *` |
| `TIMEZONE` | Fuso da data operacional | `America/Sao_Paulo` |
| `JANELA_HORAS` | Janela de coleta | `24` |
| `MIN_SUCCESSFUL_SOURCES` | Cobertura RSS mínima exigida | `7` |
| `DAILY_EXECUTION_LOG_PATH` | Registro de idempotência | `state/daily-executions.json` |
| `UNSUBSCRIBE_WORKER_URL` | URL base do Worker | Configurar explicitamente |
| `UNSUBSCRIBE_SECRET` | Chave HMAC | Obrigatória para links válidos |
| `RECIPIENTS_SOURCE` | Fonte de destinatários | Produção usa `d1` |
| `RECIPIENTS_API_URL` | Endpoint privado | Worker `/internal/recipients` |
| `RECIPIENTS_API_TOKEN` | Bearer token privado | Obrigatório em produção D1 |
| `RECIPIENTS_API_TIMEOUT_MS` | Timeout da API | `5000` |
| `RECIPIENTS_MAX_RECIPIENTS` | Limite defensivo | `500` |

### Secrets do GitHub Actions

Configure em `Settings → Secrets and variables → Actions`:

| Secret | Uso |
| --- | --- |
| `GEMINI_API_KEY` | Geração e tradução do conteúdo |
| `SMTP_USER` | Autenticação e remetente SMTP |
| `SMTP_PASS` | Senha de aplicativo SMTP |
| `UNSUBSCRIBE_SECRET` | Assinatura HMAC dos links de descadastro |
| `RECIPIENTS_API_TOKEN` | Consulta autenticada dos destinatários no D1 |
| `CLOUDFLARE_API_TOKEN` | Operações administrativas e deploy do Worker, quando necessárias |
| `CLOUDFLARE_ACCOUNT_ID` | Identificação da conta em operações Cloudflare |

`DEST_EMAIL` e `GH_PAT_UNSUB` pertencem ao caminho legado baseado em GitHub. Eles não são a fonte oficial do envio de produção quando D1 está selecionado.

## Cloudflare Worker e D1

A configuração está em `worker/wrangler.toml` e usa:

- Worker: `monitoramento-internacional-unsub`
- binding D1: `DB`
- banco: `monitoramento-internacional-recipients`
- `RECIPIENTS_STORAGE=d1`

### Endpoints

| Método e rota | Acesso | Função |
| --- | --- | --- |
| `GET /` | Público | Health check simples |
| `GET /invite` | Público | Formulário bilíngue de indicação |
| `POST /subscribe` | Público | Cadastra um novo destinatário; não reativa descadastrados |
| `GET /unsubscribe?email=...&token=...` | Público com HMAC | Descadastra o endereço |
| `GET /internal/recipients` | Bearer token | Retorna somente destinatários ativos |
| `POST /internal/recipients/import` | Bearer token | Importação administrativa limitada |

### Deploy e migrations

```bash
cd worker
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put UNSUBSCRIBE_SECRET
npx wrangler secret put RECIPIENTS_API_TOKEN
npx wrangler deploy
```

Não coloque valores de secrets no código, em arquivos TOML, em commits ou em logs.

## Testes e CI

### Validação local

```bash
npm ci
npm test
npx tsc --noEmit
node --check worker/index.js
npm audit --audit-level=moderate
ruby -e "require 'yaml'; Dir['.github/workflows/*.{yml,yaml}'].sort.each { |file| YAML.load_file(file); puts \"ok #{file}\" }"
git diff --check
```

A suíte cobre, entre outros pontos:

- configuração e comportamento seguro de `DRY_RUN`;
- idempotência diária;
- carregamento e validação de destinatários;
- API D1 do Worker;
- envio de e-mails com lista pré-validada;
- fluxo principal do pipeline;
- Interactions API, schema compatível e pacing de 5 RPM;
- alias permanente `/hoje`;
- validação e dispatch do publicador social;
- requisitos do workflow de produção.

O CI está em `.github/workflows/ci.yml` e executa testes, typecheck, validação JavaScript do Worker, sintaxe YAML e verificação de whitespace.

Na versão documentada, a suíte completa possui **85 testes automatizados**.

## Estrutura do repositório

```text
.github/workflows/     GitHub Actions de produção, CI e verificações administrativas

docs/                  Dashboards publicados pelo GitHub Pages
scripts/               Utilitários administrativos
src/                   Aplicação TypeScript
state/                 Estado persistente de execução
worker/                Cloudflare Worker, configuração e migrations D1
tests/                 Testes do pipeline, Worker e workflows
.env.example           Exemplo de configuração local
recipients.txt         Marcador público desativado, sem destinatários
```

## Evolução recente

| Entrega | Resultado |
| --- | --- |
| SDK Gemini atual | Migração para `@google/genai` e Interactions API |
| Saída estruturada | Schema compatível com a API e validação Zod local |
| Controle de alucinação estrutural | IDs originais, links/fontes imutáveis e rejeição de respostas inválidas |
| Estratégia de modelos | Flash-Lite em volume e Gemini 3.6 Flash na síntese |
| Proteção de cota | Chamadas sequenciais, intervalo de 13 segundos e retry seletivo |
| Smoke test isolado | Um único destinatário validado sem publicar HTML nem alterar estado |
| Limpeza pós-teste | Workflow e scripts temporários removidos após a validação |
| Agendamento | Execução diária configurada para 02:17 em Brasília |

## Limitações e débitos técnicos atuais

Esta seção descreve o comportamento do código atual e evita que a documentação prometa funcionalidades ainda não concluídas:

1. **Confirmação de inscrição:** novos e-mails ainda são ativados diretamente pelo formulário. Double opt-in exige integrar um serviço transacional que envie o link de confirmação ao proprietário do endereço.
2. **Limite global de tópicos:** `MAX_TOPICOS` existe na configuração, mas não é consumido pela seleção atual. O algoritmo escolhe até 8 itens por país.
3. **Servidor Express legado:** `src/server.ts` grava no `recipients.txt`; o cadastro oficial de produção é o Worker com D1.
4. **Código legado de destinatários GitHub:** o Worker ainda contém funções para manipular `recipients.txt`, embora `RECIPIENTS_STORAGE=d1` seja o modo de produção.
5. **Dashboard público:** as notícias e os resumos publicados em `docs/` são deliberadamente públicos.
6. **Conteúdo usado na síntese:** a decisão editorial e o resumo recebem atualmente os títulos candidatos, não o corpo integral das reportagens. IDs, links e fontes são preservados e a estrutura é validada, mas grounding integral exige extrair e fornecer o conteúdo das matérias.
7. **Cota gratuita:** o pacing reduz rajadas, mas limites de RPM, TPM e RPD continuam externos ao sistema. O horário de 02:17 antecede a renovação diária observada no projeto.
8. **Fallback de provedor:** NVIDIA NIM, OpenAI e GitHub Models foram avaliados, mas ainda não fazem parte do código de produção. O pipeline atual depende da disponibilidade do Gemini.
9. **Licença:** o repositório não possui um arquivo `LICENSE`; portanto, não há licença de reutilização explicitamente declarada.

## Checklist antes de um envio real manual

- confirmar que o envio é intencional;
- verificar se o dia ainda não possui estado real em `state/daily-executions.json`;
- confirmar que o endpoint D1 responde e contém a lista esperada;
- garantir que não há outra execução em andamento;
- manter `dry_run=true` para qualquer teste;
- nunca imprimir, anexar ou versionar a lista de destinatários;
- revisar o dashboard e as credenciais SMTP;
- executar o CI ou as validações locais.

---

*Powered by TAP Ecosystem* 💌
