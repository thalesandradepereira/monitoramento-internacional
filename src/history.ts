import fs from 'fs'
import path from 'path'

const HISTORY_FILE = path.join(process.cwd(), 'state', 'news-history.json')

export function getSentNewsHistory(): string[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'))
      return Array.isArray(data) ? data : []
    }
  } catch (err) {
    console.error('[history] erro ao ler histórico de notícias:', err)
  }
  return []
}

export function addSentNewsToHistory(newTitles: string[]): void {
  try {
    const history = getSentNewsHistory()
    // Mantém as últimas 500 para evitar inchaço
    const updated = [...newTitles, ...history].slice(0, 500)
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2))
  } catch (err) {
    console.error('[history] erro ao salvar histórico de notícias:', err)
  }
}
