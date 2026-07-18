import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')
import { buscarNoticias } from './fetchNews'
import { resumirNoticias } from './summarize'
import { traduzirParaIngles } from './translate'
import { enviarEmail, EmailSendReport } from './email'
import { addSentNewsToHistory } from './history'
import { gerarDashboardHTML } from './dashboard'
import { config } from './config'
import { loadRecipients, type RecipientLoadResult } from './recipients'
import {
  AlreadyCompletedExecutionError,
  assertCanStartRealExecution,
  commitAndPushPersistentState,
  getZonedNow,
  persistExecutionRecord,
  syncPersistentExecutionLog,
} from './dailyExecution'
import fs from 'fs'
import path from 'path'

function formatDisplayDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-')
  return `${day}/${month}/${year}`
}

export async function runPipeline() {
  const dryRun = config.dryRun
  const mode = config.executionMode
  const zonedNow = getZonedNow(config.timezone)
  const dataHoje = formatDisplayDate(zonedNow.date)
  let prevalidatedRecipients: RecipientLoadResult | undefined
  let realExecutionStarted = false
  let executionFinalized = false
  let emailReport: EmailSendReport = { attempted: 0, sent: 0, failed: 0 }

  console.log('=== Iniciando Monitoramento Internacional ===')
  console.log(`[modo] ${dryRun ? 'DRY RUN - nenhuma ação externa irreversível será executada' : 'ENVIO REAL'}`)
  console.log(`[agenda] Data operacional ${zonedNow.date} ${zonedNow.time} (${zonedNow.timezone}); modo=${mode}`)

  try {
    if (!dryRun) {
      syncBeforeRealExecution(zonedNow.date)
      prevalidatedRecipients = await verifyRecipientsBeforeRealExecution()
      persistExecutionRecord({
        ...zonedNow,
        state: 'in_progress',
        mode,
        attempted: 0,
        sent: 0,
        failed: 0,
      })
      realExecutionStarted = true
      commitAndPushPersistentState(`chore: registrar início do monitoramento de ${zonedNow.date}`)
    }

    const noticias = await buscarNoticias()
    if (!noticias.length) {
      console.log('Nenhuma notícia nova na janela de 24h.')
      if (!dryRun) {
        persistExecutionRecord({ ...getZonedNow(config.timezone), date: zonedNow.date, state: 'completed', mode, attempted: 0, sent: 0, failed: 0 })
        commitAndPushPersistentState(`chore: registrar monitoramento sem envios em ${zonedNow.date}`)
        executionFinalized = true
      }
      return
    }

    const topicosPt = await resumirNoticias(noticias)
    if (!topicosPt.length) {
      throw new Error('Não foi possível gerar tópicos PT-BR. (Verifique limites da API ou se existem notícias disponíveis).')
    }

    const topicosEn = await traduzirParaIngles(topicosPt)

    console.log('[docs] Gerando HTML do Dashboard...')
    const dashboardHtml = gerarDashboardHTML(topicosPt, topicosEn, dataHoje)
    const docsDir = path.resolve(__dirname, '..', 'docs')
    const dashFilename = `Dashboard-Monitoramento-${dataHoje.replace(/\//g, '-')}.html`
    const dashPath = path.join(docsDir, dashFilename)

    if (dryRun) {
      console.log(`[dry_run] Dashboard validado em memória: ${dashFilename} (${dashboardHtml.length} bytes). Nenhum arquivo de produção será alterado.`)
    } else {
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true })
      }
      fs.writeFileSync(dashPath, dashboardHtml, 'utf8')
      console.log(`[docs] Salvo em: ${dashPath}`)

      const rootLogoPath = path.resolve(__dirname, '..', 'logo.jpg')
      const docsLogoPath = path.join(docsDir, 'logo.jpg')
      if (fs.existsSync(rootLogoPath)) {
        fs.copyFileSync(rootLogoPath, docsLogoPath)
      }
    }

    if (dryRun) {
      console.log('[dry_run] Envio de e-mails ignorado. Nenhum destinatário foi acionado e a data não será registrada como concluída.')
    } else {
      if (!prevalidatedRecipients) {
        throw new Error('[recipients] Envio real bloqueado sem pré-validação de destinatários.')
      }
      emailReport = await enviarEmail(
        topicosPt,
        topicosEn,
        dataHoje,
        prevalidatedRecipients.recipients,
        prevalidatedRecipients.source,
      )
      addSentNewsToHistory(topicosPt.map(t => t.titulo))
      persistExecutionRecord({
        ...getZonedNow(config.timezone),
        date: zonedNow.date,
        state: emailReport.failed > 0 ? 'failed' : 'completed',
        mode,
        attempted: emailReport.attempted,
        sent: emailReport.sent,
        failed: emailReport.failed,
      })
      commitAndPushPersistentState(`chore: registrar execução do monitoramento de ${zonedNow.date}`)
      executionFinalized = true

      if (emailReport.failed > 0) {
        throw new Error(`[email] Execução encerrada com falha: ${emailReport.failed} entrega(s) falharam de ${emailReport.attempted} tentativa(s).`)
      }
    }

    console.log('=== Execução finalizada com sucesso ===')
  } catch (err) {
    if (err instanceof AlreadyCompletedExecutionError) {
      console.log(err.message)
      return
    }

    if (!dryRun && realExecutionStarted && !executionFinalized) {
      try {
        persistExecutionRecord({
          ...getZonedNow(config.timezone),
          date: zonedNow.date,
          state: 'failed',
          mode,
          attempted: emailReport.attempted,
          sent: emailReport.sent,
          failed: emailReport.failed,
        })
        commitAndPushPersistentState(`chore: registrar falha do monitoramento de ${zonedNow.date}`)
        executionFinalized = true
      } catch (stateErr) {
        console.error('[idempotencia] Falha adicional ao registrar estado failed após erro fatal:', stateErr)
      }
    }

    console.error('Erro fatal no pipeline:', err)
    process.exit(1)
  }
}

async function verifyRecipientsBeforeRealExecution(): Promise<RecipientLoadResult> {
  const result = await loadRecipients()
  console.log(`[recipients] Pré-validação concluída; fonte=${result.source}; total=${result.recipients.length}`)
  return result
}

function syncBeforeRealExecution(date: string): void {
  syncPersistentExecutionLog()
  assertCanStartRealExecution(date)
}

if (require.main === module) {
  runPipeline()
}
