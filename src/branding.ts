export const BRAND_TITLE = 'Monitoramento Mídia Internacional | Global Media Monitoring'
export const BRAND_TITLE_PT = 'Monitoramento Mídia Internacional'
export const BRAND_TITLE_EN = 'Global Media Monitoring'

function replaceRequired(content: string, from: string, to: string, label: string): string {
  if (!content.includes(from)) {
    throw new Error(`[branding] Estrutura esperada não encontrada: ${label}`)
  }
  return content.replace(from, to)
}

/**
 * Aplica a identidade bilíngue ao HTML produzido pelo gerador atual.
 * A transformação fica centralizada para que o dashboard e as prévias
 * usem exatamente a mesma grafia, cores e separador.
 */
export function aplicarIdentidadeDashboard(html: string): string {
  let branded = html

  branded = replaceRequired(
    branded,
    '<title>Dashboard - International Monitoring</title>',
    `<title>${BRAND_TITLE}</title>`,
    'título da aba',
  )

  branded = replaceRequired(
    branded,
    `    .logo-text {
      font-weight: 700;
      font-size: 1.5rem;
      letter-spacing: -0.5px;
      color: #fff;
    }
    .logo-text span {
      color: var(--accent);
    }`,
    `    .logo-text {
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
    }`,
    'estilo do cabeçalho',
  )

  branded = replaceRequired(
    branded,
    '<div class="logo-text">Monitoramento<span>Internacional</span></div>',
    `<div class="logo-text" aria-label="${BRAND_TITLE}"><span class="title-light">Monitoramento Mídia</span><span class="title-accent">Internacional</span><span class="title-separator">|</span><span class="title-light">Global Media</span><span class="title-accent">Monitoring</span></div>`,
    'texto do cabeçalho',
  )

  return branded
}
