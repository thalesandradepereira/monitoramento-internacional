import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { atualizarPaginaHoje, gerarPaginaHoje } from '../src/todayAlias'

test('gera redirecionamento permanente para o dashboard publicado', () => {
  const html = gerarPaginaHoje(
    'Dashboard-Monitoramento-19-07-2026.html',
    '19/07/2026',
  )

  assert.match(html, /\.\.\/Dashboard-Monitoramento-19-07-2026\.html/)
  assert.match(html, /window\.location\.replace/)
  assert.match(html, /Monitoramento Internacional de 19\/07\/2026/)
  assert.match(html, /no-store, no-cache/)
})

test('rejeita nome fora do padrão de dashboard diário', () => {
  assert.throws(
    () => gerarPaginaHoje('../../arquivo.html', '19/07/2026'),
    /Nome de dashboard inválido/,
  )
})

test('grava docs\/hoje\/index.html de forma determinística', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'today-alias-'))
  const docsDir = path.join(tempRoot, 'docs')

  try {
    const outputPath = atualizarPaginaHoje(
      docsDir,
      'Dashboard-Monitoramento-19-07-2026.html',
      '19/07/2026',
    )

    assert.equal(outputPath, path.join(docsDir, 'hoje', 'index.html'))
    assert.equal(fs.existsSync(outputPath), true)
    assert.match(
      fs.readFileSync(outputPath, 'utf8'),
      /Dashboard-Monitoramento-19-07-2026\.html/,
    )
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
