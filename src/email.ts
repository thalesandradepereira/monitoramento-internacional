import nodemailer from 'nodemailer'
import { config } from './config'
import { Topico } from './summarize'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const flags: Record<string, string> = {
  'Brasil': '🇧🇷', 'Brazil': '🇧🇷',
  'Estados Unidos': '🇺🇸', 'United States': '🇺🇸', 'USA': '🇺🇸', 'US': '🇺🇸',
  'França': '🇫🇷', 'France': '🇫🇷',
  'Inglaterra': '🇬🇧', 'England': '🇬🇧', 'UK': '🇬🇧', 'Reino Unido': '🇬🇧',
  'Espanha': '🇪🇸', 'Spain': '🇪🇸',
  'Alemanha': '🇩🇪', 'Germany': '🇩🇪',
  'Japão': '🇯🇵', 'Japan': '🇯🇵',
  'China': '🇨🇳',
  'Índia': '🇮🇳', 'India': '🇮🇳',
  'Portugal': '🇵🇹'
}

function renderToC(topicos: Topico[], lang: 'pt' | 'en'): string {
  const title = lang === 'pt' ? 'Ir para o país:' : 'Jump to country:'
  
  const countries = Array.from(new Set(topicos.map(t => t.pais)))
  
  const links = countries.map(pais => {
    const flag = flags[pais] || ''
    const anchorId = `${lang}-${pais.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    return `<a href="#${anchorId}" style="display: inline-block; background: #f3f4f6; color: #374151; text-decoration: none; font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: 16px; margin: 0 6px 8px 0; border: 1px solid #e5e7eb;">${flag} ${esc(pais)}</a>`
  }).join('')

  return `
    <div style="margin-bottom: 32px; padding: 16px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; margin-bottom: 12px;">${title}</div>
      ${links}
    </div>
  `
}

function renderNewsBlock(topicos: Topico[], lang: 'pt' | 'en'): string {
  const readMore = lang === 'pt' ? 'Ler a reportagem original' : 'Read original report'
  
  const groups: Record<string, Topico[]> = {}
  for (const t of topicos) {
    if (!groups[t.pais]) groups[t.pais] = []
    groups[t.pais].push(t)
  }

  let html = ''
  for (const [pais, items] of Object.entries(groups)) {
    const flag = flags[pais] || ''
    const anchorId = `${lang}-${pais.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    
    html += `
      <a name="${anchorId}"></a>
      <div id="${anchorId}" style="margin-top: 32px; margin-bottom: 16px;">
        <h3 style="font-size: 18px; color: #1f2937; margin: 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">
          ${flag} ${esc(pais)}
        </h3>
      </div>
    `
    
    for (const t of items) {
      html += `
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eaeaea;">
          <div style="font-size: 18px; font-weight: 700; color: #111827; margin: 4px 0 8px;">
            ${esc(t.titulo)}
          </div>
          <div style="font-size: 15px; line-height: 1.6; color: #374151; margin-bottom: 12px;">
            ${esc(t.resumo).replace(/\n/g, '<br/>')}
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

function getHeaderHTML(): string {
  return `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="font-size: 28px; margin: 0; color: #111827; font-weight: 900; letter-spacing: -0.5px;">🌎 Monitoramento Internacional</h1>
      <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Resumo Diário de Notícias</p>
    </div>
  `
}

function getFooterHTML(lang: 'pt' | 'en'): string {
  const t = lang === 'pt' ? {
    convite: 'Conhece alguém que curtiria? 🤝',
    conviteSub: 'Indique um colega para receber o Monitoramento Internacional (ah, mas avisa ele antes!).',
    btnIndicar: 'Indicar Colega',
    madeBy: 'Made by TAP 💌',
    unsub: 'Não quero mais receber',
    indicarLink: config.webUrl,
    unsubLink: `mailto:${config.smtp.user}?subject=${encodeURIComponent("Descadastrar — Monitoramento Internacional")}&body=${encodeURIComponent("Por favor, remova o meu e-mail da lista de envios.")}`
  } : {
    convite: 'Know someone who would like this? 🤝',
    conviteSub: 'Invite a colleague to receive the International Monitoring (but tell them first!).',
    btnIndicar: 'Invite Colleague',
    madeBy: 'Made by TAP 💌',
    unsub: 'I no longer wish to receive this',
    indicarLink: config.webUrl,
    unsubLink: `mailto:${config.smtp.user}?subject=${encodeURIComponent("Unsubscribe — International Monitoring")}&body=${encodeURIComponent("Please remove my email from the mailing list.")}`
  }

  return `
    <div style="margin-top: 32px; padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; text-align: center;">
      <div style="font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 8px;">${esc(t.convite)}</div>
      <div style="font-size: 14px; color: #4b5563; margin-bottom: 20px;">${esc(t.conviteSub)}</div>
      <a href="${t.indicarLink}" style="display: inline-block; background: #111827; color: #fff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; letter-spacing: 0.3px;">${esc(t.btnIndicar)}</a>
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
    const file = path.resolve(__dirname, '..', 'state', 'recipients.txt')
    if (fs.existsSync(file)) {
      txtEmails = fs.readFileSync(file, 'utf8').split('\n').map((e: string) => e.trim()).filter(Boolean)
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

  const html = `
    <div style="background: #f3f4f6; padding: 40px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        ${getHeaderHTML()}
        
        <!-- Bloco PT-BR -->
        <h2 style="font-size: 20px; color: #111827; margin-bottom: 16px; border-bottom: 2px solid #111827; padding-bottom: 8px;">Notícias do Dia</h2>
        ${renderToC(topicosPt, 'pt')}
        ${renderNewsBlock(topicosPt, 'pt')}
        ${getFooterHTML('pt')}

        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 48px 0;" />

        <!-- Bloco EN-US -->
        <h2 style="font-size: 20px; color: #111827; margin-bottom: 16px; border-bottom: 2px solid #111827; padding-bottom: 8px;">Daily News</h2>
        ${renderToC(topicosEn, 'en')}
        ${renderNewsBlock(topicosEn, 'en')}
        ${getFooterHTML('en')}
      </div>
    </div>
  `

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  })

  for (const email of emails) {
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
