import nodemailer from 'nodemailer'
import { config } from './config'
import { Topico } from './summarize'
import { gerarLinkDescadastro } from './unsubscribe'
import { gerarDashboardHTML } from './dashboard'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderNewsBlock(topicos: Topico[], lang: 'pt' | 'en'): string {
  const readMore = lang === 'pt' ? 'Ler mais' : 'Read more'
  
  const groups: Record<string, Topico[]> = {}
  for (const t of topicos) {
    if (!groups[t.pais]) groups[t.pais] = []
    groups[t.pais].push(t)
  }

  let html = ''
  for (const [pais, items] of Object.entries(groups)) {
    html += `
      <div style="margin-top: 32px; margin-bottom: 16px;">
        <h3 style="font-size: 18px; color: #111827; margin: 0; border-bottom: 2px solid #111827; padding-bottom: 8px; text-transform: uppercase;">
          📍 ${esc(pais)}
        </h3>
      </div>
    `
    
    for (const t of items) {
      const bulletList = esc(t.resumo).split('\n').filter(Boolean).map(line => `<li style="margin-bottom: 4px; color: #374151;">${line.replace(/^- /, '')}</li>`).join('')
      
      const categoriaHTML = t.categoria ? `<div style="font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">${esc(t.categoria)}</div>` : ''
      
      html += `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eaeaea;">
          ${categoriaHTML}
          <div style="font-size: 16px; font-weight: 700; color: #111827; margin: 4px 0 8px;">
            ${esc(t.titulo)}
          </div>
          <div style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
            <ul style="margin: 0; padding-left: 20px;">
              ${bulletList}
            </ul>
          </div>
          <div>
            <a href="${esc(t.link)}" style="color: #2563eb; text-decoration: none; font-weight: 500; font-size: 14px;">
              🔗 ${readMore}
            </a>
            <span style="color: #9ca3af; font-size: 13px;"> · ${esc(t.fonte)}</span>
          </div>
        </div>
      `
    }
  }
  return html
}

function getHeaderHTML(numNoticias: number, lang: 'pt' | 'en', dataStr: string): string {
  const title = lang === 'pt' ? 'Monitoramento Internacional' : 'International Monitoring'
  const subTitle = lang === 'pt' ? `As ${numNoticias} principais novidades das últimas 24h · Internacional` : `The top ${numNoticias} news from the last 24h · International`
  
  return `
    <div style="margin-bottom: 30px;">
      <h1 style="font-size: 24px; margin: 0; color: #111827; font-weight: 800; letter-spacing: -0.5px;">🌎 ${title} — ${dataStr}</h1>
      <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">${subTitle}</p>
    </div>
  `
}

function getFooterHTML(lang: 'pt' | 'en', destEmail: string): string {
  const unsubLink = gerarLinkDescadastro(destEmail)
  const inviteLink = config.unsubscribeWorkerUrl 
    ? `${config.unsubscribeWorkerUrl}/invite` 
    : `mailto:${config.smtp.user}?subject=${encodeURIComponent("Indicar um colega — Monitoramento Internacional")}&body=${encodeURIComponent("Olá! Quero indicar o e-mail: \\n\\n(digite o e-mail do seu colega aqui)")}`

  const t = lang === 'pt' ? {
    convite: 'Conhece alguém que curtiria? 🤝',
    conviteSub: 'Indique um colega para receber o Monitoramento Internacional (ah, mas avisa ele antes!).',
    btnIndicar: 'Indicar Colega',
    madeBy: 'Made by TAP 💌',
    unsub: 'Não quero mais receber',
    indicarLink: inviteLink,
    unsubLink: unsubLink
  } : {
    convite: 'Know someone who would like this? 🤝',
    conviteSub: 'Invite a colleague to receive the International Monitoring (but tell them first!).',
    btnIndicar: 'Invite Colleague',
    madeBy: 'Made by TAP 💌',
    unsub: 'I no longer wish to receive this',
    indicarLink: inviteLink,
    unsubLink: unsubLink
  }

  return `
    <div style="margin-top: 32px; padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
      <div style="font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 8px;">${esc(t.convite)}</div>
      <div style="font-size: 14px; color: #4b5563; margin-bottom: 20px;">${esc(t.conviteSub)}</div>
      <a href="${t.indicarLink}" style="display: inline-block; background: #ffffff; color: #9ca3af; border: 1px solid #e5e7eb; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 24px; border-radius: 6px; letter-spacing: 0.3px;">${esc(t.btnIndicar)}</a>
    </div>
    <div style="font-size: 12px; color: #9ca3af; margin-top: 24px; display: flex; justify-content: space-between; align-items: center;">
      <span>${esc(t.madeBy)}</span>
      <a href="${t.unsubLink}" style="color: #9ca3af; text-decoration: none; font-size: 12px; transition: color 0.2s;">${esc(t.unsub)}</a>
    </div>
  `
}

export async function enviarEmail(
  topicosPt: Topico[],
  topicosEn: Topico[],
  dataStr: string
): Promise<void> {
  const assunto = `Notícias do Dia - ${dataStr} / Daily News - ${dataStr}`
  
  // Lê do ENV
  const envEmails = config.destEmail.split(',').map(e => e.trim()).filter(Boolean)
  
  // Lê do TXT
  let txtEmails: string[] = []
  try {
    const fs = require('fs')
    const path = require('path')
    const file = path.resolve(__dirname, '..', 'recipients.txt')
    if (fs.existsSync(file)) {
      txtEmails = fs.readFileSync(file, 'utf8')
        .split('\n')
        .map((e: string) => e.trim())
        .filter((e: string) => e && !e.startsWith('#'))
    }
  } catch (err) {
    console.warn('[email] Erro ao ler recipients.txt:', err)
  }

  // Junta, remove duplicados e vazios
  const emails = Array.from(new Set([...envEmails, ...txtEmails]))
  
  if (!emails.length) {
    console.log('[email] Nenhum destinatário configurado.')
    return
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  })

  // URL gerada para o GH Pages
  const dashFilename = `Dashboard-Monitoramento-${dataStr.replace(/\//g, '-')}.html`
  const dashUrl = `https://thalesandradepereira.github.io/monitoramento-internacional/${dashFilename}`

  for (const email of emails) {
    const html = `
    <div style="background: #ffffff; padding: 40px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Aviso sobre o anexo -->
        <div style="background: #0B0F19; padding: 24px; border-radius: 8px; margin-bottom: 32px; color: #E2E8F0; text-align: center; border: 1px solid #1a202c;">
          <div style="margin-bottom: 12px;">
            <strong style="color: #D4AF37; font-size: 16px;">📊 DASHBOARD INTERATIVO ONLINE</strong>
          </div>
          <div style="font-size: 14px; margin-bottom: 20px; line-height: 1.5; color: #94A3B8;">
            Você pode visualizar estas notícias, buscar e filtrar por país no nosso painel exclusivo.
            <br/><br/>
            You can view, search and filter these news by country in our exclusive panel.
          </div>
          <a href="${dashUrl}" target="_blank" style="display: inline-block; background-color: #D4AF37; color: #0B0F19; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; letter-spacing: 0.5px; transition: opacity 0.2s;">
            ACESSAR PAINEL / ACCESS DASHBOARD
          </a>
        </div>

        <!-- Bloco PT-BR -->
        ${getHeaderHTML(topicosPt.length, 'pt', dataStr)}
        ${renderNewsBlock(topicosPt, 'pt')}
        ${getFooterHTML('pt', email)}

        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 48px 0;" />

        <!-- Bloco EN-US -->
        ${getHeaderHTML(topicosEn.length, 'en', dataStr)}
        ${renderNewsBlock(topicosEn, 'en')}
        ${getFooterHTML('en', email)}
        
      </div>
    </div>
  `

    try {
      const info = await transporter.sendMail({
        from: `"${config.fromName}" <${config.smtp.user}>`,
        to: email,
        subject: assunto,
        html,
      })
      console.log(`[email] Enviado para ${email} | id=${info.messageId}`)
    } catch (err: any) {
      console.error(`[email] Erro ao enviar para ${email}:`, err?.message || err)
    }
  }
}
