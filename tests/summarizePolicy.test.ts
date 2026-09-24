import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertEditorialCoverage,
  limitarTopicosComDiversidade,
  type Topico,
} from '../src/summarize'

function topico(pais: string, titulo: string): Topico {
  return {
    fonte: 'Fonte',
    pais,
    titulo,
    resumo: 'Resumo',
    link: `https://example.test/${encodeURIComponent(pais)}/${encodeURIComponent(titulo)}`,
    categoria: 'TECNOLOGIA',
  }
}

test('cobertura editorial incompleta bloqueia publicação e identifica países afetados', () => {
  assert.doesNotThrow(() => assertEditorialCoverage([]))

  assert.throws(
    () => assertEditorialCoverage(['Estados Unidos', 'França']),
    /Cobertura editorial incompleta.*Estados Unidos.*França/i,
  )
})

test('MAX_TOPICOS limita globalmente com diversidade entre países', () => {
  const porPais = new Map<string, Topico[]>([
    ['Brasil', [topico('Brasil', 'BR-1'), topico('Brasil', 'BR-2'), topico('Brasil', 'BR-3')]],
    ['Estados Unidos', [topico('Estados Unidos', 'US-1'), topico('Estados Unidos', 'US-2'), topico('Estados Unidos', 'US-3')]],
    ['França', [topico('França', 'FR-1'), topico('França', 'FR-2'), topico('França', 'FR-3')]],
  ])

  const resultado = limitarTopicosComDiversidade(porPais, 5)

  assert.equal(resultado.length, 5)
  assert.deepEqual(
    resultado.map(item => item.titulo),
    ['BR-1', 'US-1', 'FR-1', 'BR-2', 'US-2'],
  )
  assert.equal(new Set(resultado.map(item => item.pais)).size, 3)
})

test('MAX_TOPICOS maior que a oferta mantém todos os tópicos sem duplicar', () => {
  const porPais = new Map<string, Topico[]>([
    ['Brasil', [topico('Brasil', 'BR-1')]],
    ['Japão', [topico('Japão', 'JP-1')]],
  ])

  const resultado = limitarTopicosComDiversidade(porPais, 50)

  assert.deepEqual(resultado.map(item => item.titulo), ['BR-1', 'JP-1'])
})
