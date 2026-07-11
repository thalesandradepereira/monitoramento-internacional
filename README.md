# 🌎 Monitoramento Internacional

Uma aplicação autônoma completa (Cron + Servidor Web + Inteligência Artificial) que realiza uma varredura diária nos principais jornais de 10 países do mundo, seleciona as notícias mais relevantes usando o Google Gemini, formata resumos bilíngues (Português/Inglês) e envia diretamente para uma lista de e-mails inscritos.

## 🚀 Arquitetura e Funcionalidades

O sistema opera de forma totalmente automatizada executando um pipeline robusto todas as madrugadas (04h00 BRT):

1. **Agregação Global (RSS):** Conecta-se aos feeds RSS das maiores mídias de 10 nações (Brasil, EUA, França, Inglaterra, Espanha, Alemanha, Japão, China, Índia e Portugal).
2. **Janela Temporal e Deduplicação:** Filtra estritamente as notícias publicadas nas últimas 24 horas. O sistema possui memória (`state/news-history.json`) para impedir que uma notícia repetida seja reenviada em dias subsequentes.
3. **Arquitetura Diamante de 2 Passos (Gemini 2.5 Flash):** Em vez de enviar todas as notícias de uma vez (estourando tokens), a IA realiza uma **Triagem Rápida (Map)** nos lotes para separar links crus de Tecnologia e Ciência. Depois, realiza uma **Decisão Qualitativa (Reduce)** agrupando por país e filtrando cirurgicamente os top 8 finalistas absolutos.
4. **Localização Bilíngue e Categorização:** Após gerar os resumos em português com uma tag de **Categoria** (ex: MERCADO, TECNOLOGIA), um segundo agente de IA entra em ação para espelhar todo o conteúdo e a tag para o inglês nativo (EN-US).
5. **Composição Visual (E-mail):** Gera um e-mail HTML dinâmico, agrupado por país com suporte a bandeiras locais e as tags de categoria formatadas acima do título da matéria.
6. **Descadastro e Indicações (Cloudflare Worker):** Incorpora botões dinâmicos no rodapé de cada e-mail com links criptografados via HMAC-SHA256, servidos por um Worker Serverless na Cloudflare que edita autonomamente o arquivo `recipients.txt` via API do GitHub caso o usuário decida sair da lista.
7. **Servidor Web de Inscrição:** Roda simultaneamente um micro-serviço (Express) na rota principal para cadastro manual de novos leitores.

## 🛠 Tecnologias Utilizadas

- **TypeScript / Node.js:** Ambiente de execução moderno e tipado.
- **Google Generative AI SDK:** Integração com os modelos Flash do Gemini.
- **Express.js:** Para a interface de captação de e-mails de novos leitores.
- **Nodemailer:** Motor de disparos de e-mail via SMTP autônomo.
- **Node-Cron:** Sistema de agendamento de tarefas.
- **RSS Parser:** Leitura nativa e conversão de fontes `.xml` globais.

## ⚙️ Estrutura de Diretórios e Lógica

- `src/index.ts`: Arquivo central. Inicia o agendamento do Cron e simultaneamente dá boot no Servidor Web.
- `src/server.ts`: Camada Express. Serve a página web do formulário e recebe os métodos POST para gravar os e-mails inscritos.
- `src/run.ts`: O maestro do Pipeline. Invoca passo-a-passo a coleta, resumo, tradução e disparo.
- `src/fetchNews.ts` e `src/sources.ts`: Catálogo de mídias globais e o robô extrator de dados.
- `src/history.ts`: Memória da IA. Previne redundância lendo e gravando o banco de histórico json.
- `src/summarize.ts` e `src/translate.ts`: Módulos de Prompt Engineering e comunicação via API com o Gemini. Adicionam e traduzem as categorias da notícia.
- `src/email.ts`: O Front-End do E-mail. Responsável pelas marcações HTML e rodapés criptografados com o `unsubscribeSecret`.
- `worker/index.js`: O servidor da Cloudflare que gerencia os cliques nos botões do e-mail.

## 📦 Como Instalar e Rodar

1. **Clone o repositório:**
   \`\`\`bash
   git clone https://github.com/thalesandradepereira/monitoramento-internacional.git
   cd monitoramento-internacional
   \`\`\`

2. **Instale as dependências:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configure as Variáveis de Ambiente:**
   Copie o arquivo de exemplo e insira suas chaves do Google e credenciais SMTP.
   \`\`\`bash
   cp .env.example .env
   \`\`\`

4. **Inicie o Sistema:**
   Para deixar a automação de e-mails agendada em segundo plano E ligar a página de captura web simultaneamente na porta 3000:
   \`\`\`bash
   npm start
   \`\`\`

5. **Teste o Disparo Sob Demanda:**
   Para forçar o pipeline rodar imediatamente (sem precisar esperar a madrugada), abra outro terminal e digite:
   \`\`\`bash
   npm run once
   ```

## ☁️ Automação na Nuvem (GitHub Actions)

O projeto já vem equipado com uma integração Contínua (CI) nativa para o GitHub. Isso significa que você não precisa deixar o seu computador ligado para que os resumos sejam gerados e enviados de madrugada.

**Estratégias de Gatilho configuradas:**
1. **Agendamento Cron (Automático):** O servidor do GitHub acordará todos os dias às 07:00 UTC (04:00 Horário de Brasília) para executar toda a coleta, IA e disparo sem nenhuma intervenção humana.
2. **Disparo Manual (Workflow Dispatch):** Na aba "Actions" do GitHub, existe um botão azul chamado "Run workflow". Ao clicar nele, você força a geração de um boletim extraordinário instantaneamente.

**⚠️ Importante:** O GitHub não tem acesso ao arquivo `.env` do seu computador. Para a automação em nuvem funcionar, você **precisa** entrar na página do seu repositório no GitHub -> **Settings -> Secrets and variables -> Actions** e cadastrar as senhas vitais:
- `GEMINI_API_KEY`
- `SMTP_USER`
- `SMTP_PASS`
- `UNSUBSCRIBE_SECRET` (A chave criptográfica para o rodapé)
- `UNSUBSCRIBE_WORKER_URL` (O link da cloudflare do seu worker)

## 📬 Cadastrando Usuários

O sistema lê os destinatários de duas vias distintas e as une antes do envio:
1. **Destinatário Estático:** Varíavel `DEST_EMAIL` cadastrada de forma fixa no arquivo `.env`.
2. **Destinatários Dinâmicos:** Acessando a variável configurável `WEB_URL` (ex: `http://localhost:3000`), qualquer colega poderá preencher o formulário. O sistema salvará este contato com segurança no arquivo `recipients.txt`.

> O projeto herdou a estabilidade arquitetural de projetos irmãos como o *Radar Beleza* e *Resumo IA*, otimizado agora para o escopo bilíngue global.
