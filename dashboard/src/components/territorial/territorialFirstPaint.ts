import { fetchFeatureFocus, type FeatureFocusPayload } from '../../api/featureFocus'
import { fetchOverview, fetchTable } from '../../api/gold'
import { GOLD_COLUMNS } from '../../api/goldColumns'
import { GOLD_TABLES } from '../../api/goldTables'
import type { OverviewResponse, Scope, TableResponse } from '../../api/types'
import { fetchCompleteTable } from '../../lib/completeTable'
import { buildRequestContextKey, responseMatchesRequest } from '../../lib/requestContext'
import { fetchTerritorialRenderGeo } from '../map/territorialRenderGeo'

/**
 * Primeiro frame da landing: os três panoramas (a troca Brasil/Paraná/RMC
 * não pode cair em skeleton) e a malha do Brasil.
 * Primeiro frame do detalhe: panorama, tabela de ranking/coroplético e a
 * malha daquele território. As outras malhas não entram nesse gate.
 */
const LANDING_SCOPES: Scope[] = ['br', 'pr', 'rmc']

export type TerritorialFirstPaintRequest =
  | { kind: 'landing'; ano: number; mes: number }
  | { kind: 'detail'; scope: Scope; ano: number; mes: number }
  | { kind: 'feature'; scope: Scope; featureId: string; ano: number; mes: number }

export type LandingFirstPaint = {
  kind: 'landing'
  key: string
  overviews: Partial<Record<Scope, OverviewResponse>>
  error: boolean
}

export type DetailFirstPaint = {
  kind: 'detail'
  key: string
  scope: Scope
  overview: OverviewResponse | null
  table: TableResponse | null
  overviewError: boolean
  tableError: boolean
}

export type FeatureFirstPaint = Omit<DetailFirstPaint, 'kind'> & {
  kind: 'feature'
  featureId: string
  feature: FeatureFocusPayload | null
  featureError: boolean
}

export type TerritorialFirstPaint = LandingFirstPaint | DetailFirstPaint | FeatureFirstPaint

export type TerritorialFirstPaintPlan = {
  overviews: Scope[]
  geo: Scope
  table: Scope | null
}

type FirstPaintDeps = {
  fetchOverview: (scope: Scope, ano: number, mes: number) => Promise<OverviewResponse>
  fetchTable: (
    baseName: string,
    scope: Scope,
    ano: number,
    mes: number,
    opts?: {
      limit?: number
      offset?: number
      sort_by?: string
      sort_dir?: 'asc' | 'desc'
    },
  ) => Promise<TableResponse>
  fetchGeo: (scope: Scope) => Promise<unknown>
  fetchFeature?: (scope: Scope, featureId: string, ano: number, mes: number) => Promise<FeatureFocusPayload>
}

const defaultDeps: FirstPaintDeps = {
  fetchOverview: (scope, ano, mes) => fetchOverview(scope, ano, mes),
  fetchTable,
  fetchGeo: (scope) => fetchTerritorialRenderGeo(scope),
  fetchFeature: (scope, featureId, ano, mes) => fetchFeatureFocus(scope, featureId, ano, mes),
}

const landingCache = new Map<string, LandingFirstPaint>()
const landingInflight = new Map<string, Promise<LandingFirstPaint>>()

export function territorialFirstPaintPlan(
  request: TerritorialFirstPaintRequest,
): TerritorialFirstPaintPlan {
  if (request.kind === 'landing') {
    return { overviews: LANDING_SCOPES, geo: 'br', table: null }
  }
  return { overviews: [request.scope], geo: request.scope, table: request.scope }
}

export function landingFirstPaintKey(ano: number, mes: number): string {
  return `${ano}-${mes}-0`
}

export function peekLandingFirstPaint(ano: number, mes: number): LandingFirstPaint | null {
  return landingCache.get(landingFirstPaintKey(ano, mes)) ?? null
}

export function clearTerritorialFirstPaintCache(): void {
  landingCache.clear()
  landingInflight.clear()
}

export function loadLandingFirstPaint(
  ano: number,
  mes: number,
  options?: { bypassCache?: boolean; deps?: FirstPaintDeps },
): Promise<LandingFirstPaint> {
  const deps = options?.deps ?? defaultDeps
  const key = landingFirstPaintKey(ano, mes)
  if (!options?.bypassCache) {
    const cached = landingCache.get(key)
    if (cached) return Promise.resolve(cached)
    const pending = landingInflight.get(key)
    if (pending) return pending
  }

  const request = Promise.all(
    LANDING_SCOPES.map((scope) => deps.fetchOverview(scope, ano, mes)),
  )
    .then((results) => {
      const paint: LandingFirstPaint = {
        kind: 'landing',
        key,
        overviews: Object.fromEntries(results.map((result) => [result.scope, result])),
        error: false,
      }
      if (landingInflight.get(key) === request) {
        landingCache.set(key, paint)
        landingInflight.delete(key)
      }
      return paint
    })
    .catch(() => {
      const paint: LandingFirstPaint = { kind: 'landing', key, overviews: {}, error: true }
      if (landingInflight.get(key) === request) {
        landingCache.set(key, paint)
        landingInflight.delete(key)
      }
      return paint
    })

  landingInflight.set(key, request)
  return request
}

async function loadDetailFirstPaint(
  request: Extract<TerritorialFirstPaintRequest, { kind: 'detail' }>,
  deps: FirstPaintDeps,
): Promise<DetailFirstPaint> {
  const { scope, ano, mes } = request
  const key = buildRequestContextKey(scope, ano, mes)
  const tableName = scope === 'br' ? GOLD_TABLES.UF : GOLD_TABLES.MUNICIPIO
  const [overviewResult, tableResult] = await Promise.allSettled([
    deps.fetchOverview(scope, ano, mes),
    fetchCompleteTable((limit, offset) =>
      deps.fetchTable(tableName, scope, ano, mes, {
        limit,
        offset,
        sort_by: GOLD_COLUMNS.SALDO,
        sort_dir: 'desc',
      }),
    ),
  ])
  const overview =
    overviewResult.status === 'fulfilled' && responseMatchesRequest(overviewResult.value, key)
      ? overviewResult.value
      : null
  const table =
    tableResult.status === 'fulfilled' && responseMatchesRequest(tableResult.value, key)
      ? tableResult.value
      : null
  return {
    kind: 'detail',
    key,
    scope,
    overview,
    table,
    overviewError: overviewResult.status === 'rejected' || overview === null,
    tableError: tableResult.status === 'rejected' || table === null,
  }
}

export async function loadTerritorialFirstPaint(
  request: TerritorialFirstPaintRequest,
  deps: FirstPaintDeps = defaultDeps,
): Promise<TerritorialFirstPaint> {
  const plan = territorialFirstPaintPlan(request)
  const geo = deps.fetchGeo(plan.geo).then(
    () => undefined,
    () => undefined,
  )
  if (request.kind === 'landing') {
    const [landing] = await Promise.all([
      loadLandingFirstPaint(request.ano, request.mes, { deps }),
      geo,
    ])
    return landing
  }

  void loadLandingFirstPaint(request.ano, request.mes, { deps })
  const detailRequest = { kind: 'detail' as const, scope: request.scope, ano: request.ano, mes: request.mes }
  const featureRequest =
    request.kind === 'feature'
      ? (deps.fetchFeature ?? defaultDeps.fetchFeature)?.(request.scope, request.featureId, request.ano, request.mes)
          .then((feature) => ({ feature, featureError: false }))
          .catch(() => ({ feature: null, featureError: true }))
      : null
  const [detail, featureResult] = await Promise.all([
    loadDetailFirstPaint(detailRequest, deps),
    geo.then(() => featureRequest),
  ])
  if (request.kind !== 'feature' || !featureResult) return detail
  return {
    ...detail,
    kind: 'feature',
    featureId: request.featureId,
    feature: featureResult.feature,
    featureError: featureResult.featureError,
  }
}
