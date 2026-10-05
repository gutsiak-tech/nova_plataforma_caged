import { describe, expect, it } from 'vitest'
import type { TableResponse } from '../api/types'
import {
  applyContextPayload,
  buildRequestContextKey,
  comparisonPayloadsForContext,
  payloadForContext,
  responseMatchesRequest,
  selectionExists,
  type ContextPayload,
} from './requestContext'

const january = buildRequestContextKey('br', 2026, 1)
const february = buildRequestContextKey('br', 2026, 2)
const march = buildRequestContextKey('br', 2026, 3)

describe('request context payload gating', () => {
  it('rejects a previous month response after the month changes', () => {
    const current = applyContextPayload(null, february, january, 'Janeiro')

    expect(current).toBeNull()
    expect(payloadForContext(current, february)).toBeNull()
  })

  it('rejects a previous scope response after the scope changes', () => {
    const br = buildRequestContextKey('br', 2026, 2)
    const pr = buildRequestContextKey('pr', 2026, 2)

    expect(applyContextPayload(null, pr, br, 'Brasil')).toBeNull()
  })

  it('keeps only the latest context during rapid out-of-order changes', () => {
    let state: ContextPayload<string> | null = null
    state = applyContextPayload(state, march, february, 'Fevereiro')
    state = applyContextPayload(state, march, january, 'Janeiro')
    state = applyContextPayload(state, march, march, 'Março')
    state = applyContextPayload(state, march, february, 'Fevereiro atrasado')

    expect(payloadForContext(state, march)).toBe('Março')
  })

  it('does not expose a comparison until current and previous match their keys', () => {
    const previous = applyContextPayload(null, january, january, 'anterior')

    expect(
      comparisonPayloadsForContext(null, february, previous, january),
    ).toBeNull()

    const current = applyContextPayload(null, february, february, 'atual')
    expect(
      comparisonPayloadsForContext(current, february, previous, january),
    ).toEqual({ current: 'atual', previous: 'anterior' })
  })

  it('does not combine a new current payload with an old previous payload', () => {
    const current = applyContextPayload(null, march, march, 'Março')
    const stalePrevious = applyContextPayload(null, january, january, 'Janeiro')

    expect(
      comparisonPayloadsForContext(current, march, stalePrevious, february),
    ).toBeNull()
  })

  it('does not expose old map metrics under a new context', () => {
    const oldMetrics = applyContextPayload(null, january, january, [{ uf: 'PR' }])

    expect(payloadForContext(oldMetrics, february)).toBeNull()
  })

  it('identifies when a local selection no longer exists', () => {
    expect(selectionExists('Indústria', [{ secao: 'Serviços' }], 'secao')).toBe(false)
    expect(selectionExists('Serviços', [{ secao: 'Serviços' }], 'secao')).toBe(true)
  })

  it('returns no renderable payload while the new context is loading', () => {
    const oldPayload = applyContextPayload(null, january, january, 'número antigo')

    expect(payloadForContext(oldPayload, february)).toBeNull()
  })

  it('validates response metadata against the originating request', () => {
    const response: TableResponse = {
      month: { ano: 2026, mes: 2 },
      scope: 'pr',
      table: 'tabela_setor_pr',
      columns: [],
      total: 0,
      offset: 0,
      count: 0,
      rows: [],
    }

    expect(responseMatchesRequest(response, buildRequestContextKey('pr', 2026, 2))).toBe(true)
    expect(responseMatchesRequest(response, buildRequestContextKey('br', 2026, 2))).toBe(false)
  })
})
