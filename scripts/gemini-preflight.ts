import { getGeminiClient } from '../src/geminiHelper'

const MODEL = 'gemini-3.6-flash'
const INTERVAL_MS = 4_200

type ProbeResult = {
  name: string
  ok: boolean
  status?: number
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  for (const key of ['status', 'statusCode']) {
    const value = Number((error as Record<string, unknown>)[key])
    if (Number.isInteger(value)) return value
  }
  return undefined
}

async function runProbe(name: string, action: () => Promise<unknown>): Promise<ProbeResult> {
  await new Promise(resolve => setTimeout(resolve, INTERVAL_MS))
  try {
    await action()
    console.log(`[gemini-preflight] ${name}: ok`)
    return { name, ok: true }
  } catch (error) {
    const status = errorStatus(error)
    console.log(`[gemini-preflight] ${name}: falhou; status=${status ?? 'indisponível'}`)
    return { name, ok: false, status }
  }
}

async function main(): Promise<void> {
  const gemini = getGeminiClient()
  const results: ProbeResult[] = []

  results.push(await runProbe('generateContent sem esquema', () => (
    gemini.models.generateContent({
      model: MODEL,
      contents: 'Responda apenas OK.',
    })
  )))

  results.push(await runProbe('Interactions sem esquema', () => (
    gemini.interactions.create({
      model: MODEL,
      input: 'Responda apenas OK.',
    })
  )))

  results.push(await runProbe('Interactions sem esquema e store=false', () => (
    gemini.interactions.create({
      model: MODEL,
      input: 'Responda apenas OK.',
      store: false,
    })
  )))

  results.push(await runProbe('Interactions com esquema objeto mínimo', () => (
    gemini.interactions.create({
      model: MODEL,
      input: 'Retorne um objeto JSON com ok igual a true.',
      store: false,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      },
    })
  )))

  results.push(await runProbe('Interactions com esquema de triagem mínimo', () => (
    gemini.interactions.create({
      model: MODEL,
      input: 'Retorne uma lista JSON contendo id "1" e pais "Brasil".',
      store: false,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              pais: { type: 'string' },
            },
            required: ['id', 'pais'],
          },
        },
      },
    })
  )))

  const successful = results.filter(result => result.ok).length
  console.log(`[gemini-preflight] Resultado agregado: ${successful}/${results.length} probes aceitos.`)

  if (!results.at(-1)?.ok) {
    throw new Error('[gemini-preflight] A API ainda não aceita o formato estruturado mínimo exigido.')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
