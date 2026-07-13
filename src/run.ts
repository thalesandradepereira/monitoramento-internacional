import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')
import { buscarNoticias } from './fetchNews'
import { resumirNoticias } from './summarize'
import { traduzirParaIngles } from './translate'
import { enviarEmail } from './email'
import { addSentNewsToHistory } from './history'
import { gerarDashboardHTML } from './dashboard'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export async function runPipeline() {
  console.log('=== Iniciando Monitoramento Internacional ===')
  try {
    const noticias = await buscarNoticias()
    if (!noticias.length) {
      console.log('Nenhuma notícia nova na janela de 24h.')
      return
    }

    const topicosPt = await resumirNoticias(noticias)
    if (!topicosPt.length) {
      throw new Error('Não foi possível gerar tópicos PT-BR. (Verifique limites da API ou se existem notícias disponíveis).')
    }

    const topicosEn = await traduzirParaIngles(topicosPt)

    // Formata a data (DD/MM/YYYY)
    const dataHoje = new Date().toLocaleDateString('pt-BR')

    // Gerar Dashboard e Hospedar no GitHub Pages
    console.log('[docs] Gerando HTML do Dashboard...')
    const dashboardHtml = gerarDashboardHTML(topicosPt, topicosEn, dataHoje)
    const docsDir = path.resolve(__dirname, '..', 'docs')
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true })
    }
    
    const dashFilename = `Dashboard-Monitoramento-${dataHoje.replace(/\//g, '-')}.html`
    const dashPath = path.join(docsDir, dashFilename)
    fs.writeFileSync(dashPath, dashboardHtml, 'utf8')
    console.log(`[docs] Salvo em: ${dashPath}`)

    // Copia logo.jpg se existir na raiz
    const rootLogoPath = path.resolve(__dirname, '..', 'logo.jpg')
    const docsLogoPath = path.join(docsDir, 'logo.jpg')
    if (fs.existsSync(rootLogoPath)) {
      fs.copyFileSync(rootLogoPath, docsLogoPath)
    }

    // Sincronizar com GitHub Pages
    console.log('[git] Fazendo push do novo Dashboard para o GitHub Pages...')
    try {
      if (process.env.GITHUB_ACTIONS) {
        execSync('git config user.name "github-actions[bot]"')
        execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"')
      }
      execSync('git add docs/')
      execSync(`git commit -m "docs: adicionar dashboard de ${dataHoje}"`)
      execSync('git push')
      console.log('[git] Push concluído com sucesso.')
    } catch (err: any) {
      console.log('[git] Erro no push ou nenhuma alteração:')
      if (err.stdout) console.log(err.stdout.toString())
      if (err.stderr) console.error(err.stderr.toString())
    }

    await enviarEmail(topicosPt, topicosEn, dataHoje)

    // Atualiza histórico para não repetir depois
    addSentNewsToHistory(topicosPt.map(t => t.titulo))

    console.log('=== Execução finalizada com sucesso ===')
  } catch (err) {
    console.error('Erro fatal no pipeline:', err)
    process.exit(1) // Garante que o processo Node termine com falha (código vermelho no GitHub Action)
  }
}

// Se rodar direto por node src/run.ts
if (require.main === module) {
  runPipeline()
}
