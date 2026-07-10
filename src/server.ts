import express from 'express'
import fs from 'fs'
import path from 'path'
import { config } from './config'

const app = express()

// Middleware to parse urlencoded bodies from the HTML form
app.use(express.urlencoded({ extended: true }))

const RECIPIENTS_FILE = path.resolve(__dirname, '..', 'recipients.txt')

// Ensure state dir and file exist
if (!fs.existsSync(path.dirname(RECIPIENTS_FILE))) {
  fs.mkdirSync(path.dirname(RECIPIENTS_FILE), { recursive: true })
}
if (!fs.existsSync(RECIPIENTS_FILE)) {
  fs.writeFileSync(RECIPIENTS_FILE, '', 'utf8')
}

// Serves the HTML form
app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assinar Monitoramento Internacional</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align: center; max-width: 400px; width: 100%; }
        h1 { font-size: 24px; color: #111827; margin-bottom: 12px; }
        p { color: #4b5563; font-size: 15px; margin-bottom: 24px; }
        input[type="email"] { width: 100%; box-sizing: border-box; padding: 12px; margin-bottom: 16px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 15px; }
        button { width: 100%; padding: 12px; background: #111827; color: #fff; border: none; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
        button:hover { background: #1f2937; }
        .success { color: #059669; font-weight: 600; margin-bottom: 24px; display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🌎 Monitoramento Internacional</h1>
        <p>Receba diariamente o resumo das principais notícias globais diretamente no seu e-mail.</p>
        
        <form action="/subscribe" method="POST">
          <input type="email" name="email" placeholder="Seu melhor e-mail" required>
          <button type="submit">Inscrever-se</button>
        </form>
      </div>
    </body>
    </html>
  `
  res.send(html)
})

// Handles the form submission
app.post('/subscribe', (req, res) => {
  const { email } = req.body

  if (!email || !email.includes('@')) {
    return res.status(400).send('E-mail inválido. <a href="/">Voltar</a>')
  }

  const cleanEmail = email.trim().toLowerCase()
  
  const current = fs.readFileSync(RECIPIENTS_FILE, 'utf8')
  const recipients = current.split('\n').map(e => e.trim()).filter(Boolean)
  
  if (!recipients.includes(cleanEmail)) {
    fs.appendFileSync(RECIPIENTS_FILE, \`\${cleanEmail}\\n\`, 'utf8')
  }

  const successHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sucesso</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); text-align: center; max-width: 400px; width: 100%; }
        h1 { font-size: 24px; color: #059669; margin-bottom: 12px; }
        p { color: #4b5563; font-size: 15px; margin-bottom: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Inscrição Confirmada! 🎉</h1>
        <p>O e-mail <strong>${cleanEmail}</strong> foi cadastrado com sucesso.</p>
        <p>Você passará a receber nosso boletim diário a partir de agora.</p>
      </div>
    </body>
    </html>
  `
  res.send(successHtml)
})

export function startServer() {
  app.listen(config.port, () => {
    console.log(\`[Web] Servidor rodando em \${config.webUrl} (porta \${config.port})\`)
  })
}
