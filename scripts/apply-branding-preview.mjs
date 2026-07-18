import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, 'utf8')
}

function replaceRequired(content, from, to, label) {
  const first = content.indexOf(from)
  if (first === -1) {
    throw new Error(`[branding] Padrão obrigatório não encontrado: ${label}`)
  }
  if (content.indexOf(from, first + from.length) !== -1) {
    throw new Error(`[branding] Padrão duplicado inesperadamente: ${label}`)
  }
  return content.replace(from, to)
}

const browserTitleOld = '<title>Dashboard - International Monitoring</title>'
const browserTitleNew = '<title>Monitoramento Mídia Internacional | Global Media Monitoring</title>'

const logoCssOld = `    .logo-text {
      font-weight: 700;
      font-size: 1.5rem;
      letter-spacing: -0.5px;
      color: #fff;
    }
    .logo-text span {
      color: var(--accent);
    }`

const logoCssNew = `    .logo-text {
      font-weight: 700;
      font-size: clamp(1rem, 2vw, 1.5rem);
      letter-spacing: -0.5px;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .logo-text .title-light,
    .logo-text .title-separator {
      color: #fff;
    }
    .logo-text .title-accent {
      color: var(--accent);
    }`

const logoHtmlOld = '<div class="logo-text">Monitoramento<span>Internacional</span></div>'
const logoHtmlNew = '<div class="logo-text" aria-label="Monitoramento Mídia Internacional | Global Media Monitoring"><span class="title-light">Monitoramento Mídia</span><span class="title-accent">Internacional</span><span class="title-separator">|</span><span class="title-light">Global Media</span><span class="title-accent">Monitoring</span></div>'

function applyDashboardBranding(content, label) {
  let updated = content
  updated = replaceRequired(updated, browserTitleOld, browserTitleNew, `${label}: título da aba`)
  updated = replaceRequired(updated, logoCssOld, logoCssNew, `${label}: CSS do título`)
  updated = replaceRequired(updated, logoHtmlOld, logoHtmlNew, `${label}: cabeçalho visual`)
  return updated
}

const dashboardPath = 'src/dashboard.ts'
const dashboardUpdated = applyDashboardBranding(read(dashboardPath), dashboardPath)
write(dashboardPath, dashboardUpdated)

const emailPath = 'src/email.ts'
let emailUpdated = read(emailPath)
emailUpdated = replaceRequired(
  emailUpdated,
  "const title = lang === 'pt' ? 'Monitoramento Internacional' : 'International Monitoring'",
  "const title = lang === 'pt' ? 'Monitoramento Mídia Internacional' : 'Global Media Monitoring'",
  `${emailPath}: títulos dos blocos`,
)
emailUpdated = replaceRequired(
  emailUpdated,
  'const assunto = `Notícias do Dia - ${dataStr} / Daily News - ${dataStr}`',
  'const assunto = `Monitoramento Mídia Internacional - ${dataStr} | Global Media Monitoring - ${dataStr}`',
  `${emailPath}: assunto`,
)
emailUpdated = replaceRequired(
  emailUpdated,
  'Indicar um colega — Monitoramento Internacional',
  'Indicar um colega — Monitoramento Mídia Internacional',
  `${emailPath}: assunto de indicação`,
)
emailUpdated = replaceRequired(
  emailUpdated,
  'Indique um colega para receber o Monitoramento Internacional (ah, mas avisa ele antes!).',
  'Indique um colega para receber o Monitoramento Mídia Internacional (ah, mas avisa ele antes!).',
  `${emailPath}: convite em português`,
)
emailUpdated = replaceRequired(
  emailUpdated,
  'Invite a colleague to receive the International Monitoring (but tell them first!).',
  'Invite a colleague to receive Global Media Monitoring (but tell them first!).',
  `${emailPath}: convite em inglês`,
)
write(emailPath, emailUpdated)

const configPath = 'src/config.ts'
let configUpdated = read(configPath)
configUpdated = replaceRequired(
  configUpdated,
  "fromName: process.env.FROM_NAME || 'Monitoramento Internacional'",
  "fromName: process.env.FROM_NAME || 'Monitoramento Mídia Internacional'",
  `${configPath}: nome padrão do remetente`,
)
write(configPath, configUpdated)

const workflowPath = '.github/workflows/monitoramento.yml'
let workflowUpdated = read(workflowPath)
workflowUpdated = replaceRequired(
  workflowUpdated,
  'name: Disparo Monitoramento Internacional',
  'name: Disparo Monitoramento Mídia Internacional',
  `${workflowPath}: nome do workflow`,
)
workflowUpdated = replaceRequired(
  workflowUpdated,
  "FROM_NAME: 'Monitoramento Internacional'",
  "FROM_NAME: 'Monitoramento Mídia Internacional'",
  `${workflowPath}: nome do remetente`,
)
write(workflowPath, workflowUpdated)

const docsDir = path.join(root, 'docs')
const dashboardFiles = fs.readdirSync(docsDir)
  .map(name => {
    const match = /^Dashboard-Monitoramento-(\d{2})-(\d{2})-(\d{4})\.html$/.exec(name)
    if (!match) return null
    const [, day, month, year] = match
    return { name, time: Date.UTC(Number(year), Number(month) - 1, Number(day)) }
  })
  .filter(Boolean)
  .sort((a, b) => b.time - a.time)

if (!dashboardFiles.length) {
  throw new Error('[branding] Nenhum dashboard existente foi encontrado para criar a prévia.')
}

const sourcePreviewPath = path.join('docs', dashboardFiles[0].name)
const previewPath = path.join('docs', 'Teste-Global-Media-Monitoring.html')
const previewUpdated = applyDashboardBranding(read(sourcePreviewPath), sourcePreviewPath)
write(previewPath, previewUpdated)

const requiredBrand = 'Monitoramento Mídia Internacional | Global Media Monitoring'
if (!read(dashboardPath).includes(requiredBrand)) {
  throw new Error('[branding] O gerador do dashboard não contém a identidade final esperada.')
}
if (!read(previewPath).includes(requiredBrand)) {
  throw new Error('[branding] A página de prévia não contém a identidade final esperada.')
}
if (!read(emailPath).includes('Global Media Monitoring')) {
  throw new Error('[branding] O modelo de e-mail não contém a identidade em inglês esperada.')
}

console.log(`[branding] Identidade atualizada: ${requiredBrand}`)
console.log(`[branding] Prévia criada a partir de ${sourcePreviewPath}: ${previewPath}`)
