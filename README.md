# 🌎 Monitoramento Internacional

Uma aplicação autônoma completa (Cron + Servidor Web + Inteligência Artificial) que realiza uma varredura diária nos principais jornais de 10 países do mundo, seleciona as notícias mais relevantes usando o Google Gemini, formata resumos bilíngues (Português/Inglês) e envia diretamente para uma lista de e-mails inscritos.

## 🚀 Arquitetura e Funcionalidades

O sistema opera de forma totalmente automatizada executando um pipeline robusto todas as madrugadas (02h45 BRT):

1. **Agregação Global (RSS):** Conecta-se aos feeds RSS das maiores mídias de 10 nações (Brasil, EUA, França, Inglaterra, Espanha, Alemanha, Japão, China, Índia e Portugal).
2. **Janela Temporal e Deduplicação:** Filtra estritamente as notícias publicadas nas últimas 24 horas. O sistema possui memória (`state/news-history.json`) para impedir que uma notícia repetida seja reenviada em dias subsequentes.
3. **Curadoria Inteligente (Gemini 2.5 Flash):** Analisa o oceano de dados recebidos e exige da IA a seleção de *exatamente* 5 tópicos por país (totalizando 50), priorizando Economia, Ciência, Tecnologia, Esportes, Conflitos e Política Interna. Tudo traduzido obrigatoriamente para PT-BR.
4. **Localização Bilíngue:** Após gerar os 50 resumos em português, um segundo agente de IA entra em ação para espelhar todo o conteúdo para o inglês nativo (EN-US).
5. **Composição Visual (E-mail):** Gera um e-mail HTML dinâmico, organizado com "Table of Contents" (índice âncora) e agrupado por país com suporte automático às bandeiras locais (ex: 🇯🇵 Japão).
6. **Servidor Web de Inscrição:** Roda simultaneamente um micro-serviço (Express) na rota principal, entregando uma *Landing Page* clean para novos usuários digitarem seus e-mails e se inscreverem no boletim, alimentando o banco de destinatários (`recipients.txt`).

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
- `src/summarize.ts` e `src/translate.ts`: Módulos de Prompt Engineering e comunicação via API com o Gemini.
- `src/email.ts`: O Front-End do E-mail. Responsável pelas marcações âncora, mapeamento de bandeiras visuais e junção do banco de dados (ENV + TXT) para o disparo em massa.

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

## 📬 Cadastrando Usuários

O sistema lê os destinatários de duas vias distintas e as une antes do envio:
1. **Destinatário Estático:** Varíavel `DEST_EMAIL` cadastrada de forma fixa no arquivo `.env`.
2. **Destinatários Dinâmicos:** Acessando a variável configurável `WEB_URL` (ex: `http://localhost:3000`), qualquer colega poderá preencher o formulário. O sistema salvará este contato com segurança no arquivo `recipients.txt`.

> O projeto herdou a estabilidade arquitetural de projetos irmãos como o *Radar Beleza* e *Resumo IA*, otimizado agora para o escopo bilíngue global.
