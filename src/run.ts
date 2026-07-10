import { buscarNoticias } from './fetchNews'
import { resumirNoticias } from './summarize'
import { traduzirParaIngles } from './translate'
import { enviarEmail } from './email'
import { addSentNewsToHistory } from './history'

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
      console.log('Não foi possível gerar tópicos PT-BR.')
      return
    }

    const topicosEn = await traduzirParaIngles(topicosPt)

    // Formata a data (DD/MM/YYYY)
    const dataHoje = new Date().toLocaleDateString('pt-BR')
    await enviarEmail(topicosPt, topicosEn, dataHoje)

    // Atualiza histórico para não repetir depois
    addSentNewsToHistory(topicosPt.map(t => t.titulo))

    console.log('=== Execução finalizada com sucesso ===')
  } catch (err) {
    console.error('Erro fatal no pipeline:', err)
  }
}

// Se rodar direto por node src/run.ts
if (require.main === module) {
  runPipeline()
}
