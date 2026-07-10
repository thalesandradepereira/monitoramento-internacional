export const FONTES_RSS: { nome: string; url: string }[] = [
  // ─── 🇧🇷 BRASIL ──────────────────────────────────────────────────────────────
  { nome: 'Brasil', url: 'https://news.google.com/rss/search?q=(economia+OR+ciência+OR+tecnologia+OR+esportes+OR+conflitos+OR+política)+when:1d&hl=pt-BR&gl=BR' },
  // ─── 🇺🇸 ESTADOS UNIDOS ──────────────────────────────────────────────────────
  { nome: 'Estados Unidos', url: 'https://news.google.com/rss/search?q=(economy+OR+science+OR+technology+OR+sports+OR+conflicts+OR+politics)+when:1d&hl=en-US&gl=US' },
  // ─── 🇫🇷 FRANÇA ──────────────────────────────────────────────────────────────
  { nome: 'França', url: 'https://news.google.com/rss/search?q=(économie+OR+science+OR+technologie+OR+sports+OR+conflits+OR+politique)+when:1d&hl=fr&gl=FR' },
  // ─── 🇬🇧 INGLATERRA ──────────────────────────────────────────────────────────
  { nome: 'Inglaterra', url: 'https://news.google.com/rss/search?q=(economy+OR+science+OR+technology+OR+sports+OR+conflicts+OR+politics)+when:1d&hl=en-GB&gl=GB' },
  // ─── 🇪🇸 ESPANHA ─────────────────────────────────────────────────────────────
  { nome: 'Espanha', url: 'https://news.google.com/rss/search?q=(economía+OR+ciencia+OR+tecnología+OR+deportes+OR+conflictos+OR+política)+when:1d&hl=es&gl=ES' },
  // ─── 🇩🇪 ALEMANHA ────────────────────────────────────────────────────────────
  { nome: 'Alemanha', url: 'https://news.google.com/rss/search?q=(wirtschaft+OR+wissenschaft+OR+technologie+OR+sport+OR+konflikte+OR+politik)+when:1d&hl=de&gl=DE' },
  // ─── 🇯🇵 JAPÃO ───────────────────────────────────────────────────────────────
  { nome: 'Japão', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(経済 OR 科学 OR 技術 OR スポーツ OR 紛争 OR 政治)') + '+when:1d&hl=ja&gl=JP' },
  // ─── 🇨🇳 CHINA ───────────────────────────────────────────────────────────────
  { nome: 'China', url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('(经济 OR 科学 OR 技术 OR 体育 OR 冲突 OR 政治)') + '+when:1d&hl=zh-CN&gl=CN' },
  // ─── 🇮🇳 ÍNDIA ───────────────────────────────────────────────────────────────
  { nome: 'Índia', url: 'https://news.google.com/rss/search?q=(economy+OR+science+OR+technology+OR+sports+OR+conflicts+OR+politics)+when:1d&hl=en-IN&gl=IN' },
  // ─── 🇵🇹 PORTUGAL ────────────────────────────────────────────────────────────
  { nome: 'Portugal', url: 'https://news.google.com/rss/search?q=(economia+OR+ciência+OR+tecnologia+OR+desporto+OR+conflitos+OR+política)+when:1d&hl=pt-PT&gl=PT' }
]
