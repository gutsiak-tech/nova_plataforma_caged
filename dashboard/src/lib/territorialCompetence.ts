import type { OverviewResponse, Scope, TableResponse } from '../api/types'
import { buildRequestContextKey } from './requestContext'

export type DetailCompetenceSnapshot = {
  key: string
  overview: OverviewResponse | null
  table: TableResponse | null
  overviewError: boolean
  tableError: boolean
}

const detailCache = new Map<string, DetailCompetenceSnapshot>()

export function competenceMonthKey(ano: number, mes: number): string {
  return `${ano}-${mes}`
}

export function detailCompetenceKey(scope: Scope, ano: number, mes: number): string {
  return buildRequestContextKey(scope, ano, mes)
}

export function peekDetailCompetence(
  scope: Scope,
  ano: number,
  mes: number,
): DetailCompetenceSnapshot | null {
  return detailCache.get(detailCompetenceKey(scope, ano, mes)) ?? null
}

export function rememberDetailCompetence(snapshot: DetailCompetenceSnapshot): void {
  if (snapshot.overviewError || snapshot.tableError) return
  detailCache.set(snapshot.key, snapshot)
}

export function clearDetailCompetenceCache(): void {
  detailCache.clear()
}

export function featureCompetenceReady(
  status: 'loading' | 'ready' | 'error',
  period: { id: string; ano: number; mes: number } | null,
  featureId: string,
  ano: number,
  mes: number,
): boolean {
  if (status === 'loading') return false
  if (status === 'error') return period == null
  return (
    period != null &&
    period.id === featureId &&
    period.ano === ano &&
    period.mes === mes
  )
}

/** The active surface may publish a competence only when its own critical data matches it. */
export function competenceSurfaceReady(input: {
  active: boolean
  dataReady: boolean
  featureOpen: boolean
  featureReady: boolean
}): boolean {
  if (!input.active || !input.dataReady) return false
  if (input.featureOpen && !input.featureReady) return false
  return true
}
