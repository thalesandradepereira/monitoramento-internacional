# Migração privada de destinatários para Cloudflare D1

Esta etapa promove o Cloudflare D1 a fonte oficial dos destinatários em produção, sem remover `recipients.txt` nesta tarefa e sem importar ou registrar destinatários reais na documentação.

## Arquitetura

- O D1 é a fonte privada e oficial dos destinatários em produção.
- O Worker acessa o banco pelo binding `DB` e usa `RECIPIENTS_STORAGE=d1` para inscrições e descadastros no mesmo rollout do envio.
- O monitoramento consulta `GET /internal/recipients` com `Authorization: Bearer <token>` para receber somente destinatários ativos e pré-valida essa API antes de persistir `in_progress`.
- Gemini e demais componentes de IA não devem receber a lista de endereços.
- Logs administrativos não devem conter e-mails completos nem tokens.

## Banco e binding

A migration `worker/migrations/0001_create_recipients.sql` cria a tabela `recipients` com `email` único, `status`, datas UTC, origem de consentimento e data de descadastro. O `worker/wrangler.toml` principal permanece sem bloco D1 para continuar válido antes da criação do banco real e preservar o modo legado `RECIPIENTS_STORAGE=github`. O arquivo `worker/wrangler.d1.example.toml` documenta o futuro binding:

- binding D1: `DB`;
- `database_name`: `monitoramento-internacional-recipients`;
- `database_id`: placeholder textual `SUBSTITUA_PELO_DATABASE_ID_REAL`, que não deve ser usado em deploy.

Nenhum token, segredo, ID real ou e-mail real deve ser registrado no repositório.

## Comandos manuais futuros

Não execute estes comandos nesta fase. Eles são referência para uma etapa operacional posterior:

```bash
npx wrangler d1 create monitoramento-internacional-recipients
# Copiar o database_id retornado e atualizar worker/wrangler.toml em uma alteração controlada.
npx wrangler d1 migrations apply monitoramento-internacional-recipients --local --config worker/wrangler.d1.example.toml
npx wrangler d1 migrations apply monitoramento-internacional-recipients --remote --config worker/wrangler.d1.example.toml
npx wrangler secret put RECIPIENTS_API_TOKEN --config worker/wrangler.d1.example.toml
```

## Variáveis e secrets

- `RECIPIENTS_STORAGE=d1`: modo de produção para inscrição e descadastro públicos no mesmo rollout do envio. Se o binding `DB` estiver indisponível, deve falhar explicitamente, sem fallback silencioso para GitHub.
- `RECIPIENTS_STORAGE=github`: modo legado preservado apenas para rollback temporário controlado com `recipients.txt`.
- `RECIPIENTS_API_TOKEN`: secret do Worker para os endpoints internos administrativos; no workflow principal, deve vir exclusivamente de `secrets.RECIPIENTS_API_TOKEN`.
- `GH_PAT_UNSUB`: ainda necessário enquanto `RECIPIENTS_STORAGE=github`; deve ser revogado em fase futura após a migração completa.

## Endpoints internos

### `GET /internal/recipients`

Endpoint interno autenticado. Requer `Authorization: Bearer <token>`, usa `Cache-Control: no-store` e retorna somente ativos:

```json
{
  "recipients": ["pessoa@example.com"],
  "count": 1
}
```

O exemplo usa domínio reservado para documentação e não deve ser inserido em migrations ou dados reais.

### `POST /internal/recipients/import`

Endpoint administrativo autenticado para importação privada controlada. Aceita uma lista JSON ou objeto com `recipients`, normaliza, remove duplicidades, cadastra ou reativa de forma idempotente e retorna apenas contagens. O Worker limita o corpo real a 32 KiB e usa um limite conservador de 100 destinatários por requisição para evitar excesso de operações D1 em uma única invocação:

```json
{
  "received": 0,
  "imported": 0,
  "reactivated": 0,
  "invalid": 0
}
```

Não retorna a lista completa e não deve registrar endereços recebidos em logs.

## Sequência segura de implantação

1. Criar o D1 manualmente.
2. Copiar `worker/wrangler.d1.example.toml` ou mover o bloco D1 para `worker/wrangler.toml` com o `database_id` real em alteração revisada.
3. Aplicar migrations localmente e validar com dados fictícios.
4. Configurar `RECIPIENTS_API_TOKEN` como secret do Worker.
5. Fazer deploy controlado do Worker, ainda com `RECIPIENTS_STORAGE=github`.
6. Importar destinatários de forma privada pelo endpoint administrativo, sem expor a lista a IA.
7. Validar contagens, descadastros e listagem de ativos.
8. Trocar `RECIPIENTS_STORAGE=d1` em janela controlada no mesmo rollout que promove o workflow principal para D1.
9. Configurar o workflow principal com `RECIPIENTS_SOURCE=d1`, mantendo o endpoint privado atual, pré-validação autenticada antes de `in_progress` e o token vindo exclusivamente de secret.

## Rollback

Enquanto `recipients.txt` continuar preservado, ele não deve ser removido nesta tarefa e serve apenas para rollback temporário controlado. O rollback operacional do Worker é retornar `RECIPIENTS_STORAGE=github` e reimplantar o Worker em alteração controlada. Não deve haver fallback automático quando `d1` estiver selecionado no monitoramento ou no Worker: se a API/binding D1 falhar, não usar `recipients.txt`, `DEST_EMAIL` ou GitHub como fallback, para evitar divergência silenciosa entre fontes.

## Remoções futuras

Após validação completa da migração:

- remover `recipients.txt` do fluxo ativo;
- revogar `GH_PAT_UNSUB`;
- remover código legado de GitHub do Worker;
- tratar os e-mails existentes no histórico Git, considerando reescrita planejada ou rotação de repositório privado, conforme política do projeto.
