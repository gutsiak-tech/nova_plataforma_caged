import type { SalaryMovement, Scope } from './types'
import { http } from './http'

export type FeatureParentLevel = 'brasil' | 'uf'
export type FeatureLevel = 'uf' | 'municipality'
export type FeatureSaldoInterpretation = 'participacao' | 'denominador_zero' | 'sinais_opostos'

export type FeatureMovementMetrics = {
  admissoes: number | null
  desligamentos: number | null
  saldo: number | null
}

export type FeatureParentRef = {
  level: FeatureParentLevel
  id: string
  name: string | null
}

export type FeatureIdentity = {
  level: FeatureLevel
  id: string
  name: string | null
  parent: FeatureParentRef
  cod_uf: string | null
  uf_sigla: string | null
  uf: string | null
  uf_norm: string | null
  cod_municipio: string | null
  municipio: string | null
  municipio_norm: string | null
}

export type FeatureSalary = {
  movimento: SalaryMovement
  n_salarios_validos: number | null
  salario_medio: number | null
  salario_mediano: number | null
}

export type FeatureSectorRow = FeatureMovementMetrics & { secao: string }
export type FeatureOccupationRow = FeatureMovementMetrics & { cbo2002ocupacao: string }
export type FeatureSexRow = FeatureMovementMetrics & { sexo: string }
export type FeatureAgeRow = FeatureMovementMetrics & { faixa_etaria: string }
export type FeatureSchoolingRow = FeatureMovementMetrics & { graudeinstrucao: string }

export type FeatureRanking<T> = {
  limit: number
  total: number
  by_saldo: T[]
  by_admissoes: T[]
  by_desligamentos: T[]
}

export type FeatureProfiles = {
  sexo: FeatureSexRow[]
  faixa_etaria: FeatureAgeRow[]
  graudeinstrucao: FeatureSchoolingRow[]
}

export type FeatureTimeseriesPoint = FeatureMovementMetrics & {
  ano: number
  mes: number
}

export type FeatureParticipation = {
  admissoes: number | null
  desligamentos: number | null
  saldo: number | null
  saldo_interpretation: FeatureSaldoInterpretation
}

export type FeatureComparisonParent = {
  level: FeatureParentLevel
  id: string
  name: string | null
  kpis: FeatureMovementMetrics
  participation: FeatureParticipation
}

export type FeatureFocusPayload = {
  identity: FeatureIdentity
  period: { ano: number; mes: number }
  kpis: FeatureMovementMetrics
  salary: FeatureSalary | null
  sectors: FeatureRanking<FeatureSectorRow>
  occupations: FeatureRanking<FeatureOccupationRow>
  profiles: FeatureProfiles
  timeseries: FeatureTimeseriesPoint[]
  comparison: { parents: FeatureComparisonParent[] }
}

export const FEATURE_FOCUS_LIMIT = 5
export const FEATURE_FOCUS_MOVEMENT: SalaryMovement = 'admissao'

const cache = new Map<string, FeatureFocusPayload>()
const inflight = new Map<string, Promise<FeatureFocusPayload>>()

export function featureLevel(scope: Scope): FeatureLevel {
  return scope === 'br' ? 'uf' : 'municipality'
}

export function featureFocusCacheKey(
  level: FeatureLevel,
  featureId: string,
  ano: number,
  mes: number,
  movimento: SalaryMovement,
): string {
  return `${level}:${featureId}:${ano}:${mes}:${movimento}`
}

export function peekFeatureFocus(
  scope: Scope,
  featureId: string,
  ano: number,
  mes: number,
  movimento: SalaryMovement = FEATURE_FOCUS_MOVEMENT,
): FeatureFocusPayload | null {
  return cache.get(featureFocusCacheKey(featureLevel(scope), featureId, ano, mes, movimento)) ?? null
}

export function clearFeatureFocusCache(): void {
  cache.clear()
  inflight.clear()
}

export function rememberFeatureFocus(
  scope: Scope,
  ano: number,
  mes: number,
  payload: FeatureFocusPayload,
  movimento: SalaryMovement = FEATURE_FOCUS_MOVEMENT,
): void {
  cache.set(featureFocusCacheKey(featureLevel(scope), payload.identity.id, ano, mes, movimento), payload)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function metrics(value: unknown): FeatureMovementMetrics | null {
  if (!isRecord(value)) return null
  if (!('admissoes' in value) || !('desligamentos' in value) || !('saldo' in value)) return null
  return {
    admissoes: numberOrNull(value.admissoes),
    desligamentos: numberOrNull(value.desligamentos),
    saldo: numberOrNull(value.saldo),
  }
}

function parentRef(value: unknown): FeatureParentRef | null {
  if (!isRecord(value)) return null
  if (value.level !== 'brasil' && value.level !== 'uf') return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  return { level: value.level, id: value.id, name: textOrNull(value.name) }
}

function identityOf(value: unknown): FeatureIdentity | null {
  if (!isRecord(value)) return null
  if (value.level !== 'uf' && value.level !== 'municipality') return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  const parent = parentRef(value.parent)
  if (!parent) return null
  return {
    level: value.level,
    id: value.id,
    name: textOrNull(value.name),
    parent,
    cod_uf: textOrNull(value.cod_uf),
    uf_sigla: textOrNull(value.uf_sigla),
    uf: textOrNull(value.uf),
    uf_norm: textOrNull(value.uf_norm),
    cod_municipio: textOrNull(value.cod_municipio),
    municipio: textOrNull(value.municipio),
    municipio_norm: textOrNull(value.municipio_norm),
  }
}

function labeledRows<T extends FeatureMovementMetrics>(
  value: unknown,
  labelKey: string,
): T[] {
  if (!Array.isArray(value)) return []
  const rows: T[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const label = textOrNull(item[labelKey])
    const movement = metrics(item)
    if (!label || !movement) continue
    rows.push({ ...movement, [labelKey]: label } as T)
  }
  return rows
}

function ranking<T extends FeatureMovementMetrics>(
  value: unknown,
  labelKey: string,
): FeatureRanking<T> {
  const source = isRecord(value) ? value : {}
  return {
    limit: typeof source.limit === 'number' ? source.limit : 0,
    total: typeof source.total === 'number' ? source.total : 0,
    by_saldo: labeledRows<T>(source.by_saldo, labelKey),
    by_admissoes: labeledRows<T>(source.by_admissoes, labelKey),
    by_desligamentos: labeledRows<T>(source.by_desligamentos, labelKey),
  }
}

function salaryOf(value: unknown): FeatureSalary | null {
  if (value == null) return null
  if (!isRecord(value)) return null
  if (value.movimento !== 'admissao' && value.movimento !== 'desligamento') return null
  return {
    movimento: value.movimento,
    n_salarios_validos: numberOrNull(value.n_salarios_validos),
    salario_medio: numberOrNull(value.salario_medio),
    salario_mediano: numberOrNull(value.salario_mediano),
  }
}

function timeseriesOf(value: unknown): FeatureTimeseriesPoint[] {
  if (!Array.isArray(value)) return []
  const points: FeatureTimeseriesPoint[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const movement = metrics(item)
    if (!movement) continue
    if (typeof item.ano !== 'number' || typeof item.mes !== 'number') continue
    points.push({ ano: item.ano, mes: item.mes, ...movement })
  }
  return points
}

function participationOf(value: unknown): FeatureParticipation {
  const source = isRecord(value) ? value : {}
  const interpretation = source.saldo_interpretation
  const saldo_interpretation: FeatureSaldoInterpretation =
    interpretation === 'denominador_zero' || interpretation === 'sinais_opostos'
      ? interpretation
      : 'participacao'
  return {
    admissoes: numberOrNull(source.admissoes),
    desligamentos: numberOrNull(source.desligamentos),
    saldo: numberOrNull(source.saldo),
    saldo_interpretation,
  }
}

function parentsOf(value: unknown): FeatureComparisonParent[] {
  if (!isRecord(value) || !Array.isArray(value.parents)) return []
  const parents: FeatureComparisonParent[] = []
  for (const item of value.parents) {
    if (!isRecord(item)) continue
    if (item.level !== 'brasil' && item.level !== 'uf') continue
    if (typeof item.id !== 'string') continue
    const kpis = metrics(item.kpis)
    if (!kpis) continue
    parents.push({
      level: item.level,
      id: item.id,
      name: textOrNull(item.name),
      kpis,
      participation: participationOf(item.participation),
    })
  }
  return parents
}

export function parseFeatureFocusPayload(value: unknown): FeatureFocusPayload | null {
  if (!isRecord(value)) return null
  const identity = identityOf(value.identity)
  const kpis = metrics(value.kpis)
  if (!identity || !kpis) return null
  const period = isRecord(value.period) ? value.period : {}
  const profiles = isRecord(value.profiles) ? value.profiles : {}
  return {
    identity,
    period: {
      ano: typeof period.ano === 'number' ? period.ano : 0,
      mes: typeof period.mes === 'number' ? period.mes : 0,
    },
    kpis,
    salary: salaryOf(value.salary),
    sectors: ranking<FeatureSectorRow>(value.sectors, 'secao'),
    occupations: ranking<FeatureOccupationRow>(value.occupations, 'cbo2002ocupacao'),
    profiles: {
      sexo: labeledRows<FeatureSexRow>(profiles.sexo, 'sexo'),
      faixa_etaria: labeledRows<FeatureAgeRow>(profiles.faixa_etaria, 'faixa_etaria'),
      graudeinstrucao: labeledRows<FeatureSchoolingRow>(profiles.graudeinstrucao, 'graudeinstrucao'),
    },
    timeseries: timeseriesOf(value.timeseries),
    comparison: { parents: parentsOf(value.comparison) },
  }
}

export function featureEndpoint(scope: Scope, featureId: string): string {
  return scope === 'br'
    ? `/api/gold/v1/feature/uf/${encodeURIComponent(featureId)}`
    : `/api/gold/v1/feature/municipality/${encodeURIComponent(featureId)}`
}

export async function fetchFeatureFocus(
  scope: Scope,
  featureId: string,
  ano: number,
  mes: number,
  movimento: SalaryMovement = FEATURE_FOCUS_MOVEMENT,
  limit = FEATURE_FOCUS_LIMIT,
): Promise<FeatureFocusPayload> {
  const level = featureLevel(scope)
  const key = featureFocusCacheKey(level, featureId, ano, mes, movimento)
  const cached = cache.get(key)
  if (cached) return cached
  const pending = inflight.get(key)
  if (pending) return pending

  const request = http
    .get<unknown>(featureEndpoint(scope, featureId), {
      params: { ano, mes, movimento, limit },
    })
    .then((response) => {
      const payload = parseFeatureFocusPayload(response.data)
      inflight.delete(key)
      if (!payload) throw new Error('Resposta de feature inválida')
      cache.set(key, payload)
      return payload
    })
    .catch((error: unknown) => {
      inflight.delete(key)
      throw error
    })

  inflight.set(key, request)
  return request
}
