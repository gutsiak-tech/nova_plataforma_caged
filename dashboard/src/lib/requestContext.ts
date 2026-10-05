import type { GoldRow, OverviewResponse, Scope, TableResponse } from '../api/types'

export type RequestContextKey = `${Scope}:${number}:${number}`

export type ContextPayload<T> = {
  key: RequestContextKey
  data: T
}

export function buildRequestContextKey(
  scope: Scope,
  ano: number,
  mes: number,
): RequestContextKey {
  return `${scope}:${ano}:${mes}`
}

export function responseMatchesRequest(
  response: Pick<OverviewResponse | TableResponse, 'scope' | 'month'>,
  requestKey: RequestContextKey,
): boolean {
  return buildRequestContextKey(
    response.scope,
    response.month.ano,
    response.month.mes,
  ) === requestKey
}

export function applyContextPayload<T>(
  current: ContextPayload<T> | null,
  activeKey: RequestContextKey,
  requestKey: RequestContextKey,
  data: T,
): ContextPayload<T> | null {
  if (requestKey !== activeKey) return current
  return { key: requestKey, data }
}

export function payloadForContext<T>(
  payload: ContextPayload<T> | null,
  activeKey: RequestContextKey,
): T | null {
  return payload?.key === activeKey ? payload.data : null
}

export function comparisonPayloadsForContext<TCurrent, TPrevious>(
  current: ContextPayload<TCurrent> | null,
  currentKey: RequestContextKey,
  previous: ContextPayload<TPrevious> | null,
  previousKey: RequestContextKey | null,
): { current: TCurrent; previous: TPrevious } | null {
  if (!previousKey) return null
  const currentData = payloadForContext(current, currentKey)
  const previousData = payloadForContext(previous, previousKey)
  if (!currentData || !previousData) return null
  return { current: currentData, previous: previousData }
}

export function selectionExists(
  selected: string | null,
  rows: GoldRow[],
  column: string,
): boolean {
  if (selected === null) return true
  return rows.some((row) => String(row[column] ?? '') === selected)
}
