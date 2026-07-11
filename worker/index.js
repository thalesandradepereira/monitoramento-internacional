/**
 * Cloudflare Worker — Descadastro automático do Resumo IA.
 *
 * Recebe o clique do link no e-mail, verifica o token HMAC,
 * e usa a API do GitHub para remover o e-mail de recipients.txt.
 *
 * Secrets (configurar via `wrangler secret put`):
 *   UNSUBSCRIBE_SECRET — mesma chave usada para assinar os links
 *   GH_PAT_UNSUB       — Personal Access Token do GitHub (contents:write)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // Rota principal: descadastro
    if (url.pathname === '/unsubscribe') {
      return handleUnsubscribe(url, env)
    }

    // Rotas de indicação/cadastro
    if (url.pathname === '/invite') {
      return handleInvite(url)
    }
    if (url.pathname === '/subscribe') {
      return handleSubscribe(url, env)
    }

    // Health check
    if (url.pathname === '/') {
      return new Response('Monitoramento Auto — Worker ✅', { status: 200 })
    }

    return new Response('Not found', { status: 404 })
  },
}

// ─── HMAC ────────────────────────────────────────────────────────────────────

async function hmacSign(email, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(email))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleUnsubscribe(url, env) {
  const email = (url.searchParams.get('email') || '').toLowerCase().trim()
  const token = url.searchParams.get('token') || ''

  if (!email || !token) {
    return htmlResponse(400, 
      { pt: 'Parâmetros inválidos', en: 'Invalid parameters' }, 
      { pt: 'O link está incompleto. Tente usar o link original do e-mail.', en: 'The link is incomplete. Try using the original link from the email.' }
    )
  }

  // Verifica assinatura HMAC
  const expected = await hmacSign(email, env.UNSUBSCRIBE_SECRET)
  if (token !== expected) {
    return htmlResponse(403, 
      { pt: 'Link inválido', en: 'Invalid link' }, 
      { pt: 'Este link de descadastro não é válido. Use o link original do seu e-mail.', en: 'This unsubscribe link is invalid. Use the original link from your email.' }
    )
  }

  // Remove do recipients.txt via API do GitHub
  try {
    const removed = await removeFromRecipients(email, env.GH_PAT_UNSUB, env.GH_REPO)
    if (removed) {
      return htmlResponse(200, 
        { pt: 'Pronto! ✅', en: 'Done! ✅' }, 
        { pt: `O e-mail <strong>${escHtml(email)}</strong> foi removido com sucesso. Você não receberá mais o Monitoramento Auto.`, en: `The email <strong>${escHtml(email)}</strong> was successfully removed. You will no longer receive the Auto Monitoring.` }
      )
    } else {
      return htmlResponse(200, 
        { pt: 'Já removido', en: 'Already removed' }, 
        { pt: `O e-mail <strong>${escHtml(email)}</strong> já não consta na lista. Nenhuma ação necessária.`, en: `The email <strong>${escHtml(email)}</strong> is no longer on the list. No action needed.` }
      )
    }
  } catch (err) {
    console.error('Erro ao remover:', err)
    return htmlResponse(500, 
      { pt: 'Erro interno', en: 'Internal error' }, 
      { pt: 'Não foi possível processar o descadastro. Tente novamente mais tarde.', en: 'Could not process the unsubscription. Try again later.' }
    )
  }
}

async function handleInvite(url) {
  // Tela com o formulário de indicação
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitoramento Auto — Invite / Indicar</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #f3f4f6;
    }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #111827; margin-bottom: 8px; font-weight: 700; }
    p { font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 24px; }
    form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
    label { font-size: 14px; font-weight: 600; color: #374151; }
    input[type="email"] {
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="email"]:focus { border-color: #111827; }
    button {
      background: #111827;
      color: #fff;
      border: none;
      padding: 14px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    button:hover { background: #374151; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0; }
    .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">🚀</div>
    
    <h1>Indicar um colega 🤝</h1>
    <p>Conhece alguém que curtiria o Monitoramento Auto? Adicione o e-mail abaixo (ah, mas avisa a pessoa antes!).</p>
    <form action="/subscribe" method="GET">
      <label for="email">E-mail do colega:</label>
      <input type="email" id="email" name="email" placeholder="email@exemplo.com" required>
      <button type="submit">Cadastrar Colega</button>
    </form>

    <hr>

    <h1>Invite a colleague 🤝</h1>
    <p>Know someone who would like the Auto Monitoring? Add their email below (but tell them first!).</p>
    <form action="/subscribe" method="GET">
      <label for="email_en">Colleague's email:</label>
      <input type="email" id="email_en" name="email" placeholder="email@example.com" required>
      <button type="submit">Invite Colleague</button>
    </form>

    <div class="footer">Made by TAP</div>
  </div>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function handleSubscribe(url, env) {
  const email = (url.searchParams.get('email') || '').toLowerCase().trim()

  if (!email || !email.includes('@')) {
    return htmlResponse(400, 
      { pt: 'E-mail inválido', en: 'Invalid email' }, 
      { pt: 'Por favor, digite um endereço de e-mail válido.', en: 'Please enter a valid email address.' }
    )
  }

  try {
    const added = await addToRecipients(email, env.GH_PAT_UNSUB, env.GH_REPO)
    if (added) {
      return htmlResponse(200, 
        { pt: 'Sucesso! 🎉', en: 'Success! 🎉' }, 
        { pt: `O e-mail <strong>${escHtml(email)}</strong> foi cadastrado! O próximo resumo já será enviado para ele.`, en: `The email <strong>${escHtml(email)}</strong> was successfully registered! They will receive the next summary.` }
      )
    } else {
      return htmlResponse(200, 
        { pt: 'Já cadastrado', en: 'Already registered' }, 
        { pt: `O e-mail <strong>${escHtml(email)}</strong> já está na lista do Monitoramento Auto!`, en: `The email <strong>${escHtml(email)}</strong> is already on the Auto Monitoring list!` }
      )
    }
  } catch (err) {
    console.error('Erro ao adicionar:', err)
    return htmlResponse(500, 
      { pt: 'Erro interno', en: 'Internal error' }, 
      { pt: 'Não foi possível cadastrar no momento. Tente novamente mais tarde.', en: 'Could not register at this time. Try again later.' }
    )
  }
}

// ─── GitHub API ──────────────────────────────────────────────────────────────

async function removeFromRecipients(email, ghPat, repo) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/recipients.txt`
  const headers = {
    Authorization: `Bearer ${ghPat}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'resumo-ia-unsubscribe',
  }

  // 1. Ler o arquivo atual
  const getRes = await fetch(apiUrl, { headers })
  if (!getRes.ok) throw new Error(`GitHub GET falhou: ${getRes.status}`)

  const fileData = await getRes.json()
  const content = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
  const lines = content.split('\n')

  // 2. Filtrar o e-mail
  const emailLower = email.toLowerCase().trim()
  const newLines = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return true
    // Aceita linhas com vírgula (multi-email por linha)
    const emails = trimmed.split(',').map((e) => e.trim().toLowerCase())
    return !emails.includes(emailLower)
  })

  if (newLines.length === lines.length) {
    return false // já não estava na lista
  }

  // 3. Commitar a remoção
  const newContent = newLines.join('\n')
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `🚫 Descadastro automático: ${email}`,
      content: btoa(unescape(encodeURIComponent(newContent))),
      sha: fileData.sha,
    }),
  })

  if (!putRes.ok) {
    const err = await putRes.json()
    throw new Error(err.message || `GitHub PUT falhou: ${putRes.status}`)
  }

  return true
}

async function addToRecipients(email, ghPat, repo) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/recipients.txt`
  const headers = {
    Authorization: `Bearer ${ghPat}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'resumo-ia-subscribe',
  }

  // 1. Ler o arquivo atual
  const getRes = await fetch(apiUrl, { headers })
  if (!getRes.ok) throw new Error(`GitHub GET falhou: ${getRes.status}`)

  const fileData = await getRes.json()
  const content = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
  const lines = content.split('\n')

  // 2. Verificar se já existe
  const emailLower = email.toLowerCase().trim()
  const exists = lines.some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return false
    const emails = trimmed.split(',').map((e) => e.trim().toLowerCase())
    return emails.includes(emailLower)
  })

  if (exists) {
    return false // já cadastrado
  }

  // 3. Adicionar no final e commitar
  lines.push(emailLower)
  const newContent = lines.join('\n')
  
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `✨ Cadastro via formulário: ${email}`,
      content: btoa(unescape(encodeURIComponent(newContent))),
      sha: fileData.sha,
    }),
  })

  if (!putRes.ok) {
    const err = await putRes.json()
    throw new Error(err.message || `GitHub PUT falhou: ${putRes.status}`)
  }

  return true
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function htmlResponse(status, titulos, mensagens) {
  const emoji = status === 200 ? '✅' : status === 403 ? '🔒' : '⚠️'
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitoramento Auto</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      border: 1px solid #f3f4f6;
    }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #111827; margin-bottom: 12px; font-weight: 700; }
    p { font-size: 15px; color: #4b5563; line-height: 1.6; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 32px 0; }
    .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    
    <h1>${escHtml(titulos.pt)}</h1>
    <p>${mensagens.pt}</p>
    
    <hr>
    
    <h1>${escHtml(titulos.en)}</h1>
    <p>${mensagens.en}</p>

    <div class="footer">Made by TAP</div>
  </div>
</body>
</html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
