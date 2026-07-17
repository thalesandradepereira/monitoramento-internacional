# Migração privada de destinatários para Cloudflare D1

Esta primeira fase prepara o Worker para usar Cloudflare D1 como fonte privada de destinatários sem alterar o envio atual, sem remover `recipients.txt` e sem importar destinatários reais.

## Arquitetura

- O D1 será a fonte privada dos destinatários.
- O Worker acessará o banco pelo binding `DB`.
- Em fase posterior, o monitoramento consultará `GET /internal/recipients` com `Authorization: Bearer <token>` para receber somente destinatários ativos.
- Gemini e demais componentes de IA não devem receber a lista de endereços.
- Logs administrativos não devem conter e-mails completos nem tokens.

## Banco e binding

A migration `worker/migrations/0001_create_recipients.sql` cria a tabela `recipients` com `email` único, `status`, datas UTC, origem de consentimento e data de descadastro. A configuração do Worker declara:

- binding D1: `DB`;
- `database_name`: `monitoramento-internacional-recipients`;
- `database_id`: placeholder `00000000-0000-0000-0000-000000000000`, que deve ser substituído apenas depois da criação manual do banco.

Nenhum token, segredo, ID real ou e-mail real deve ser registrado no repositório.

## Comandos manuais futuros

Não execute estes comandos nesta fase. Eles são referência para uma etapa operacional posterior:

```bash
npx wrangler d1 create monitoramento-internacional-recipients
# Copiar o database_id retornado e atualizar worker/wrangler.toml em uma alteração controlada.
npx wrangler d1 migrations apply monitoramento-internacional-recipients --local --config worker/wrangler.toml
npx wrangler d1 migrations apply monitoramento-internacional-recipients --remote --config worker/wrangler.toml
npx wrangler secret put RECIPIENTS_API_TOKEN --config worker/wrangler.toml
```

## Variáveis e secrets

- `RECIPIENTS_STORAGE=github`: padrão desta fase, preserva inscrição e descadastro via `recipients.txt`.
- `RECIPIENTS_STORAGE=d1`: usa D1 para inscrição e descadastro públicos. Se o binding `DB` estiver indisponível, deve falhar explicitamente, sem fallback silencioso para GitHub.
- `RECIPIENTS_API_TOKEN`: secret do Worker para os endpoints internos administrativos.
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

Endpoint administrativo autenticado para importação privada controlada. Aceita uma lista JSON ou objeto com `recipients`, normaliza, remove duplicidades, cadastra ou reativa de forma idempotente e retorna apenas contagens:

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
2. Atualizar o `database_id` em alteração revisada.
3. Aplicar migrations localmente e validar com dados fictícios.
4. Configurar `RECIPIENTS_API_TOKEN` como secret do Worker.
5. Fazer deploy controlado do Worker, ainda com `RECIPIENTS_STORAGE=github`.
6. Importar destinatários de forma privada pelo endpoint administrativo, sem expor a lista a IA.
7. Validar contagens, descadastros e listagem de ativos.
8. Trocar `RECIPIENTS_STORAGE=d1` em janela controlada.
9. Atualizar o pipeline de monitoramento em fase posterior para consultar o endpoint interno.

## Rollback

Enquanto `recipients.txt` continuar preservado, o rollback operacional é retornar `RECIPIENTS_STORAGE=github` e reimplantar o Worker. Não deve haver fallback automático quando `d1` estiver selecionado, para evitar divergência silenciosa entre fontes.

## Remoções futuras

Após validação completa da migração:

- remover `recipients.txt` do fluxo ativo;
- revogar `GH_PAT_UNSUB`;
- remover código legado de GitHub do Worker;
- tratar os e-mails existentes no histórico Git, considerando reescrita planejada ou rotação de repositório privado, conforme política do projeto.
