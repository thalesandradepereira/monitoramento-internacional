import assert from 'node:assert/strict'
import test from 'node:test'
import { validateRecoveryMarker } from '../../scripts/validate-recovery-marker.mjs'

test('recovery marker accepts current Brasília date and fresh request', () => {
  const now = new Date('2026-08-29T10:40:00Z')
  const marker = [
    'schema_version=1',
    'date=2026-08-29',
    'reason=external-controller-recovery',
    'requested_at=2026-08-29T10:39:00Z',
    '',
  ].join('\n')
  assert.equal(validateRecoveryMarker(marker, now).date, '2026-08-29')
})

test('recovery marker rejects stale or wrong-date requests', () => {
  const now = new Date('2026-08-29T10:40:00Z')
  assert.throws(() => validateRecoveryMarker([
    'schema_version=1',
    'date=2026-08-28',
    'reason=external-controller-recovery',
    'requested_at=2026-08-29T10:39:00Z',
  ].join('\n'), now), /data atual/i)

  assert.throws(() => validateRecoveryMarker([
    'schema_version=1',
    'date=2026-08-29',
    'reason=external-controller-recovery',
    'requested_at=2026-08-29T09:00:00Z',
  ].join('\n'), now), /expirado/i)
})
