import { createHash } from 'crypto'
import { aplicarIdentidadeDashboard } from '../src/branding'
import { config } from '../src/config'
import { getZonedNow } from '../src/dailyExecution'
import { gerarDashboardHTML } from '../src/dashboard'
import { enviarEmail } from '../src/email'
import { buscarNoticias } from '../src/fetchNews'
import { loadRecipients, maskEmail } from '../src/recipients'
import { resumirNoticias } from '../src/summarize'
import { traduzirParaIngles } from '../src/translate'

// SHA-256 do destinatário autorizado. O endereço não fica exposto no repositório.
const AUTHORIZED_RECIPIENT_SHA256 = 'c0d0bdcc897f0ddc2be38792731cb238deed7fef46f869f6f1b70fdfb63cc38e'

function recipientHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export function resolveSingleRecipientByHash(recipients: string[], expectedHash: string): string {
  const matches = recipients.filter(email => recipientHash(email) === expectedHash)
  if (matches.length !== 1) {
    throw new Error(`[isolated-smoke] Destinatário autorizado não resolvido de forma única; correspondências=${matches.length}.`)
  }
  return matches[0]
}

function formatDisplayDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-')
  return `${day}/${month}/${year}`
}

async function main(): Promise<void> {
  console.log('[isolated-smoke] Iniciando teste completo sem publicar dashboard ou alterar estado.')

  const recipientResult = await loadRecipients()
  if (recipientResult.source !== 'd1') {
    throw new Error(`[isolated-smoke] Fonte de destinatários inesperada: ${recipientResult.source}.`)
  }
  const recipient = resolveSingleRecipientByHash(
    recipientResult.recipients,
    AUTHORIZED_RECIPIENT_SHA256,
  )
  console.log(`[isolated-smoke] Destinatário exclusivo validado: ${maskEmail(recipient)}.`)

  const noticias = await buscarNoticias()
  if (!noticias.length) throw new Error('[isolated-smoke] Nenhuma notícia disponível para o teste.')

  const topicosPt = await resumirNoticias(noticias)
  if (!topicosPt.length) throw new Error('[isolated-smoke] Gemini não gerou tópicos PT-BR.')

  const topicosEn = await traduzirParaIngles(topicosPt)
  const zonedNow = getZonedNow(config.timezone)
  const displayDate = formatDisplayDate(zonedNow.date)
  const html = aplicarIdentidadeDashboard(gerarDashboardHTML(topicosPt, topicosEn, displayDate))
  if (!html.includes('Content-Security-Policy') || html.length < 1_000) {
    throw new Error('[isolated-smoke] Dashboard gerado não passou na validação estrutural.')
  }

  const report = await enviarEmail(
    topicosPt,
    topicosEn,
    displayDate,
    [recipient],
    'd1',
  )
  if (report.attempted !== 1 || report.sent !== 1 || report.failed !== 0) {
    throw new Error(`[isolated-smoke] Resultado de envio inesperado: ${JSON.stringify(report)}.`)
  }

  console.log('[isolated-smoke] Teste concluído: uma única mensagem enviada; nenhuma publicação ou persistência realizada.')
}

if (require.main === module) {
  main().catch(error => {
    console.error('[isolated-smoke] Erro fatal:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
