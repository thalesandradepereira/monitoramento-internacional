import fs from 'fs'
import path from 'path'

const DASHBOARD_FILENAME_PATTERN = /^Dashboard-Monitoramento-\d{2}-\d{2}-\d{4}\.html$/

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function gerarPaginaHoje(dashboardFilename: string, displayDate: string): string {
  if (!DASHBOARD_FILENAME_PATTERN.test(dashboardFilename)) {
    throw new Error(`Nome de dashboard inválido para o alias /hoje: ${dashboardFilename}`)
  }

  const safeFilename = escapeHtml(dashboardFilename)
  const safeDate = escapeHtml(displayDate)
  const relativeTarget = `../${safeFilename}`

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta http-equiv="refresh" content="0; url=${relativeTarget}">
  <link rel="canonical" href="${relativeTarget}">
  <title>Monitoramento Internacional de hoje — ${safeDate}</title>
  <script>
    window.location.replace(new URL(${JSON.stringify(relativeTarget)}, window.location.href).href)
  </script>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
      background: #07120f;
      color: #f4e8d8;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }
    main { max-width: 680px; }
    a { color: #e6b57a; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Monitoramento Internacional de ${safeDate}</h1>
    <p>Redirecionando para a edição mais recente publicada.</p>
    <p><a href="${relativeTarget}">Abrir o painel de hoje</a></p>
  </main>
</body>
</html>
`
}

export function atualizarPaginaHoje(
  docsDir: string,
  dashboardFilename: string,
  displayDate: string,
): string {
  const todayDir = path.join(docsDir, 'hoje')
  const todayPath = path.join(todayDir, 'index.html')
  fs.mkdirSync(todayDir, { recursive: true })
  fs.writeFileSync(todayPath, gerarPaginaHoje(dashboardFilename, displayDate), 'utf8')
  return todayPath
}
