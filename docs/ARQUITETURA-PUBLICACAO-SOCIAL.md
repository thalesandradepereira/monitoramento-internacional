# Arquitetura da publicação social automática

## Objetivo

Integrar o Monitoramento Mídia Internacional a um publicador social separado, mantendo o dashboard público e isolando credenciais e integrações Meta em um repositório privado.

## Decisão de arquitetura

```text
monitoramento-internacional (público)
  ├─ gera e versiona o dashboard em docs/
  ├─ registra a execução em state/daily-executions.json
  ├─ aguarda o HTML responder no GitHub Pages
  └─ envia repository_dispatch com metadados não sensíveis
                   ↓
monitoramento-social-publisher (privado)
  ├─ valida novamente o dashboard
  ├─ gera a imagem com a data operacional
  ├─ publica a mídia em URL temporária/pública autorizada
  ├─ publica Instagram Story pela API oficial
  ├─ prepara alternativa autorizada para WhatsApp
  ├─ registra idempotência por canal e data
  └─ envia notificação operacional
```

O repositório público não deverá armazenar tokens da Meta. Ele somente possuirá um segredo de integração com escopo mínimo para acionar o repositório privado.

## Gatilho escolhido

Será utilizado `repository_dispatch`, com o evento:

```text
dashboard_published
```

Payload previsto:

```json
{
  "schema_version": 1,
  "monitoring_date": "2026-07-18",
  "display_date": "18/07/2026",
  "dashboard_url": "https://thalesandradepereira.github.io/monitoramento-internacional/Dashboard-Monitoramento-18-07-2026.html",
  "dashboard_filename": "Dashboard-Monitoramento-18-07-2026.html",
  "timezone": "America/Sao_Paulo",
  "source_repository": "thalesandradepereira/monitoramento-internacional",
  "source_sha": "<commit>",
  "validated_at": "<ISO-8601>"
}
```

A data é obtida do registro persistente da execução concluída, e não por soma de dias.

## Comportamento atual da integração

O script `scripts/dispatch-social-publisher.mjs`:

1. lê `state/daily-executions.json`;
2. seleciona uma execução `completed` no fuso `America/Sao_Paulo`;
3. confirma que o arquivo correspondente existe em `docs/`;
4. aguarda o HTML responder com HTTP 200 e conteúdo da data esperada;
5. envia o evento ao repositório privado;
6. não imprime o token nos logs;
7. encerra sem erro quando a integração ainda não foi configurada.

## Configuração necessária no repositório público

### Variable

```text
SOCIAL_PUBLISHER_REPOSITORY=thalesandradepereira/monitoramento-social-publisher
```

### Secret

```text
SOCIAL_PUBLISHER_TOKEN=<token restrito ao repositório privado>
```

Preferência de autenticação, em ordem:

1. GitHub App instalada apenas nos dois repositórios;
2. fine-grained personal access token com expiração e acesso somente ao repositório privado;
3. token clássico somente como solução temporária.

O token deve possuir apenas a permissão necessária para disparar o evento no repositório privado.

## Instagram Stories

A publicação automática é tecnicamente viável pela API oficial para conta profissional elegível. Para Stories, a conta deverá ser Business e estar corretamente associada ao aplicativo Meta e, conforme o fluxo escolhido, à Página do Facebook.

Credenciais previstas no repositório privado:

```text
META_APP_ID
META_APP_SECRET
INSTAGRAM_USER_ID
INSTAGRAM_ACCESS_TOKEN
```

Permissões deverão ser limitadas ao conteúdo publicado pela própria conta, incluindo a permissão oficial de publicação de conteúdo aplicável ao tipo de login adotado.

A imagem consumida pela API precisa estar acessível publicamente durante o processamento da Meta. A opção inicial recomendada é publicar somente a imagem final, sem dados sensíveis, em `docs/social/AAAA-MM-DD/story.jpg` do repositório público ou em um bucket Cloudflare R2 público dedicado.

## WhatsApp Status

A WhatsApp Business Platform oficial documenta APIs para mensagens, mídia, templates, webhooks e gerenciamento de contas. Não foi identificado um endpoint oficial para publicar automaticamente no Status do WhatsApp.

Portanto, o sistema não deverá usar automação de navegador, sessão do WhatsApp Web, armazenamento de senha, QR Code persistente ou bibliotecas não oficiais para simular uma publicação humana.

Alternativas autorizadas:

1. gerar imagem e texto prontos e enviar uma notificação para publicação manual no Status;
2. enviar a imagem e o link como mensagem oficial a contatos que deram consentimento, observando templates, janela de atendimento e custos da plataforma;
3. habilitar uma integração futura somente se a Meta disponibilizar oficialmente uma API de Status.

## Idempotência do repositório privado

Registro mínimo por data e canal:

```json
{
  "monitoring_date": "2026-07-18",
  "dashboard_url": "https://...",
  "image_url": "https://...",
  "instagram": {
    "state": "completed",
    "platform_id": "<id>",
    "attempts": 1
  },
  "whatsapp": {
    "state": "manual_required",
    "attempts": 0
  },
  "updated_at": "<ISO-8601>"
}
```

Estados sugeridos por canal:

```text
pending
in_progress
completed
failed
manual_required
```

Uma repetição automática deverá executar somente o canal que ainda não estiver concluído.

## Controles de segurança

- repositório de integração privado;
- GitHub Environment `production`;
- segredos nunca incluídos no payload do dispatch;
- permissões explícitas e mínimas nos workflows;
- tokens com expiração e rotação;
- logs sem tokens, IDs pessoais ou conteúdo de credenciais;
- validação do domínio e do nome esperado do dashboard;
- proteção contra path traversal e URLs arbitrárias;
- `concurrency` por data operacional;
- modo manual de reprocessamento com canal selecionável;
- nenhuma publicação quando a validação do dashboard falhar.

## Próximas etapas

1. criar o repositório privado `monitoramento-social-publisher`;
2. configurar a autenticação entre os repositórios;
3. implementar geração da imagem 1080 × 1920 com `logo.jpg` e data centralizada;
4. configurar o aplicativo Meta e validar a conta Instagram Business;
5. implementar o cliente oficial do Instagram e o registro de idempotência;
6. definir a alternativa autorizada para WhatsApp;
7. executar testes em modo `dry_run`;
8. liberar o Environment `production` somente após a validação manual.
