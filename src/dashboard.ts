import { Topico } from './summarize'

export function gerarDashboardHTML(topicosPt: Topico[], topicosEn: Topico[], dataStr: string): string {
  const allData = [
    ...topicosPt.map(t => ({ ...t, lang: 'pt' })),
    ...topicosEn.map(t => ({ ...t, lang: 'en' }))
  ]

  const dataJson = JSON.stringify(allData)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dashboard - International Monitoring</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #0B0F19;
      --bg-panel: rgba(255, 255, 255, 0.03);
      --glass-border: rgba(255, 255, 255, 0.1);
      --text-main: #E2E8F0;
      --text-muted: #94A3B8;
      --accent: #D4AF37;
      --accent-hover: #FDE047;
    }
    body {
      margin: 0;
      font-family: 'Inter', sans-serif;
      background-color: var(--bg-main);
      color: var(--text-main);
      min-height: 100vh;
      background-image: radial-gradient(circle at top right, rgba(212, 175, 55, 0.15), transparent 400px),
                        radial-gradient(circle at bottom left, rgba(255, 255, 255, 0.05), transparent 400px);
    }
    header {
      padding: 1.5rem 5%;
      border-bottom: 1px solid var(--glass-border);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo-container {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .logo-img {
      height: 48px; /* Altura ajustável do logo */
      width: auto;
      object-fit: contain;
      border-radius: 8px; /* Caso não seja transparente */
    }
    .logo-text {
      font-weight: 700;
      font-size: 1.5rem;
      letter-spacing: -0.5px;
      color: #fff;
    }
    .logo-text span {
      color: var(--accent);
    }
    .date-badge {
      background: var(--bg-panel);
      border: 1px solid var(--glass-border);
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      color: var(--accent);
      font-weight: 600;
    }
    .container {
      padding: 2rem 5%;
      display: flex;
      gap: 2rem;
      align-items: flex-start;
    }
    .filters {
      flex: 0 0 300px;
      background: var(--bg-panel);
      border: 1px solid var(--glass-border);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
      position: sticky;
      top: 6rem;
    }
    .filter-group {
      margin-bottom: 1.5rem;
    }
    .filter-group label {
      display: block;
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    input, select {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--glass-border);
      border-radius: 8px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s ease;
      box-sizing: border-box;
    }
    input:focus, select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
    }
    select option {
      background: var(--bg-main);
      color: var(--text-main);
    }
    .results {
      flex: 1;
    }
    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .results-count {
      color: var(--text-muted);
      font-size: 0.95rem;
    }
    .news-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .news-card {
      background: var(--bg-panel);
      border: 1px solid var(--glass-border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .news-card:hover {
      transform: translateY(-4px);
      border-color: rgba(212, 175, 55, 0.5);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .card-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
    }
    .category {
      color: var(--accent);
    }
    .country {
      color: var(--text-muted);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.4;
      margin: 0 0 1rem 0;
      color: #fff;
    }
    .card-summary {
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--text-muted);
      flex: 1;
    }
    .card-summary ul {
      margin: 0;
      padding-left: 1.2rem;
    }
    .card-summary li {
      margin-bottom: 0.25rem;
    }
    .card-footer {
      margin-top: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--glass-border);
      padding-top: 1rem;
    }
    .read-more {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.875rem;
      transition: color 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .read-more:hover {
      color: var(--accent-hover);
    }
    .source {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .btn-clear {
      width: 100%;
      padding: 0.75rem 1rem;
      margin-top: 0.5rem;
      background: rgba(212, 175, 55, 0.1);
      border: 1px solid var(--accent);
      border-radius: 8px;
      color: var(--accent);
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s ease;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn-clear:hover {
      background: var(--accent);
      color: var(--bg-main);
      box-shadow: 0 0 15px rgba(212, 175, 55, 0.4);
    }
    /* Simple CSS reset/scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-main); }
    ::-webkit-scrollbar-thumb { background: var(--bg-panel); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
    
    @media (max-width: 768px) {
      .container {
        flex-direction: column;
      }
      .filters {
        flex: none;
        width: 100%;
        position: static;
        box-sizing: border-box;
      }
    }
  </style>
</head>
<body>

<header>
  <div class="logo-container">
    <img src="logo.jpg" alt="TAP Logo" class="logo-img" onerror="this.style.display='none'">
    <div class="logo-text">Monitoramento<span>Internacional</span></div>
  </div>
  <div class="date-badge">${dataStr}</div>
</header>

<div class="container">
  <aside class="filters">
    <div class="filter-group">
      <label for="search">Busca / Search</label>
      <input type="text" id="search" placeholder="Palavra-chave...">
    </div>
    
    <div class="filter-group">
      <label for="lang">Idioma / Language</label>
      <select id="lang">
        <option value="pt">Português (PT-BR)</option>
        <option value="en">English (US)</option>
      </select>
    </div>

    <div class="filter-group">
      <label for="country">País / Country</label>
      <select id="country">
        <option value="all">Todos / All</option>
      </select>
    </div>

    <div class="filter-group">
      <label for="category">Categoria / Category</label>
      <select id="category">
        <option value="all">Todas / All</option>
      </select>
    </div>
    
    <button id="clear-filters" class="btn-clear">Limpar / Clear</button>
  </aside>

  <main class="results">
    <div class="results-header">
      <h2 style="margin: 0; font-size: 1.5rem; color: #fff;">Resultados</h2>
      <span class="results-count" id="count">0 notícias</span>
    </div>
    <div class="news-grid" id="grid">
      <!-- Injected by JS -->
    </div>
  </main>
</div>

<script>
  // Injeta os dados originais no frontend
  const data = ${dataJson};

  const searchInput = document.getElementById('search');
  const langSelect = document.getElementById('lang');
  const countrySelect = document.getElementById('country');
  const categorySelect = document.getElementById('category');
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('count');
  const clearBtn = document.getElementById('clear-filters');

  // Utility de escape HTML simples para prevenir injections em propriedades sem tratamento
  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function populateSelects() {
    const lang = langSelect.value;
    const currentData = data.filter(d => d.lang === lang);

    const countries = [...new Set(currentData.map(d => d.pais))].filter(Boolean).sort();
    const categories = [...new Set(currentData.map(d => d.categoria))].filter(Boolean).sort();

    const currentCountry = countrySelect.value;
    const currentCategory = categorySelect.value;

    countrySelect.innerHTML = '<option value="all">Todos / All</option>';
    categorySelect.innerHTML = '<option value="all">Todas / All</option>';

    countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      countrySelect.appendChild(opt);
    });

    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    });

    if (currentCountry !== 'all' && countries.includes(currentCountry)) {
      countrySelect.value = currentCountry;
    }
    if (currentCategory !== 'all' && categories.includes(currentCategory)) {
      categorySelect.value = currentCategory;
    }
  }

  function render(items) {
    countEl.textContent = \`\${items.length} notícia\${items.length !== 1 ? 's' : ''}\`;
    
    grid.innerHTML = items.map(item => {
      const readMoreTxt = item.lang === 'pt' ? 'Ler mais' : 'Read more';
      
      const bulletList = (item.resumo || '').split('\\n')
        .filter(Boolean)
        .map(line => \`<li>\${esc(line.replace(/^- /, ''))}</li>\`)
        .join('');

      return \`
        <div class="news-card">
          <div class="card-meta">
            <span class="category">\${esc(item.categoria) || 'Geral'}</span>
            <span class="country">\${esc(item.pais) || 'Global'}</span>
          </div>
          <h3 class="card-title">\${esc(item.titulo)}</h3>
          <div class="card-summary">
            <ul>\${bulletList}</ul>
          </div>
          <div class="card-footer">
            <a href="\${esc(item.link)}" target="_blank" class="read-more">
              \${readMoreTxt} &rarr;
            </a>
            <span class="source">\${esc(item.fonte)}</span>
          </div>
        </div>
      \`;
    }).join('');
  }

  function filterData() {
    const query = searchInput.value.toLowerCase();
    const lang = langSelect.value;
    const country = countrySelect.value;
    const category = categorySelect.value;

    const filtered = data.filter(item => {
      const matchLang = item.lang === lang;
      const matchCountry = country === 'all' || item.pais === country;
      const matchCategory = category === 'all' || item.categoria === category;
      const matchSearch = query === '' 
        || (item.titulo || '').toLowerCase().includes(query)
        || (item.resumo || '').toLowerCase().includes(query)
        || (item.fonte || '').toLowerCase().includes(query);

      return matchLang && matchCountry && matchCategory && matchSearch;
    });

    render(filtered);
  }

  // Binds
  searchInput.addEventListener('input', filterData);
  langSelect.addEventListener('change', () => {
    populateSelects();
    filterData();
  });
  countrySelect.addEventListener('change', filterData);
  categorySelect.addEventListener('change', filterData);
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    countrySelect.value = 'all';
    categorySelect.value = 'all';
    filterData();
  });

  // Initialization
  populateSelects();
  filterData(); // trigger first render
</script>
</body>
</html>`
}
