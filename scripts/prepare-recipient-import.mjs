#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

export const MAX_IMPORT_BYTES = 32 * 1024
export const MAX_IMPORT_RECIPIENTS = 100
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return null
  return email
}

export function parseRecipientsText(text) {
  const entries = []
  const invalid = []

  for (const rawLine of String(text).split(/\r?\n/)) {
    const withoutComment = rawLine.split('#')[0]
    for (const rawItem of withoutComment.split(',')) {
      const trimmed = rawItem.trim()
      if (!trimmed) continue
      const normalized = normalizeEmail(trimmed)
      if (!normalized) invalid.push(1)
      else entries.push(normalized)
    }
  }

  const seen = new Set()
  let duplicateEntries = 0
  const recipients = []
  for (const email of entries) {
    if (seen.has(email)) {
      duplicateEntries += 1
      continue
    }
    seen.add(email)
    recipients.push(email)
  }

  const payload = JSON.stringify({ recipients })
  return {
    payload,
    recipients,
    counts: {
      parsedEntries: entries.length + invalid.length,
      validEntries: entries.length,
      uniqueRecipients: recipients.length,
      duplicateEntries,
      invalidEntries: invalid.length,
      payloadBytes: Buffer.byteLength(payload, 'utf8'),
      maxRecipients: MAX_IMPORT_RECIPIENTS,
      maxBytes: MAX_IMPORT_BYTES,
    },
  }
}

export function validateImportPlan(plan) {
  const errors = []
  if (plan.counts.invalidEntries > 0) errors.push('invalid_recipient_entries')
  if (plan.counts.duplicateEntries > 0) errors.push('duplicate_recipient_entries')
  if (plan.counts.uniqueRecipients === 0) errors.push('empty_recipient_import')
  if (plan.counts.uniqueRecipients > MAX_IMPORT_RECIPIENTS) errors.push('recipient_limit_exceeded')
  if (plan.counts.payloadBytes > MAX_IMPORT_BYTES) errors.push('payload_size_limit_exceeded')
  return errors
}

function printCounts(counts) {
  console.log(`Parsed entries: ${counts.parsedEntries}`)
  console.log(`Valid entries: ${counts.validEntries}`)
  console.log(`Unique recipients: ${counts.uniqueRecipients}`)
  console.log(`Duplicate entries: ${counts.duplicateEntries}`)
  console.log(`Invalid entries: ${counts.invalidEntries}`)
  console.log(`Payload bytes: ${counts.payloadBytes}/${counts.maxBytes}`)
  console.log(`Worker recipient limit: ${counts.uniqueRecipients}/${counts.maxRecipients}`)
}

function main(argv) {
  const args = new Map()
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args.set(key, next)
      i += 1
    } else {
      args.set(key, 'true')
    }
  }
  const inputPath = args.get('--input') || 'recipients.txt'
  const payloadPath = args.get('--payload')
  const json = args.has('--json')
  const text = readFileSync(inputPath, 'utf8')
  const plan = parseRecipientsText(text)
  const errors = validateImportPlan(plan)

  if (payloadPath && errors.length === 0) writeFileSync(payloadPath, plan.payload, { encoding: 'utf8', mode: 0o600 })

  if (json) console.log(JSON.stringify({ ok: errors.length === 0, counts: plan.counts, errors }))
  else printCounts(plan.counts)

  if (errors.length > 0) {
    console.error(`Recipient import validation failed: ${errors.join(', ')}`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv)
