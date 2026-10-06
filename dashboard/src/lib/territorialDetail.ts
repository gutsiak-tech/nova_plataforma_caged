import { GOLD_COLUMNS } from '../api/goldColumns'
import type { GoldRow, OverviewResponse, Scope } from '../api/types'
import { GEO_URL_BY_SCOPE } from '../components/map/territoryBackgroundConfig'
import {
  DEFAULT_SALARY_MOVEMENT,
  getTerritorialSalarySummary,
  type TerritorialSalarySummary,
} from './salarySummary'
import { SLUG_BY_SCOPE, type TerritorialSlug } from './territorialRoute'

export type TerritorialJoinProperty = 'uf_norm' | 'municipio_norm'

export type TerritorialGeography = {
  slug: TerritorialSlug
  joinProperty: TerritorialJoinProperty
  labelKey: typeof GOLD_COLUMNS.UF | typeof GOLD_COLUMNS.MUNICIPIO
  geoUrl: string
  rankTitle: string
}

/** Contrato da tela detalhada. As URLs devem permanecer iguais às do mapa existente. */
export const TERRITORIAL_GEOGRAPHY: Record<Scope, TerritorialGeography> = {
  br: {
    slug: SLUG_BY_SCOPE.br,
    joinProperty: 'uf_norm',
    labelKey: GOLD_COLUMNS.UF,
    geoUrl: GEO_URL_BY_SCOPE.br,
    rankTitle: 'UFs por saldo',
  },
  pr: {
    slug: SLUG_BY_SCOPE.pr,
    joinProperty: 'municipio_norm',
    labelKey: GOLD_COLUMNS.MUNICIPIO,
    geoUrl: GEO_URL_BY_SCOPE.pr,
    rankTitle: 'Municípios por saldo',
  },
  rmc: {
    slug: SLUG_BY_SCOPE.rmc,
    joinProperty: 'municipio_norm',
    labelKey: GOLD_COLUMNS.MUNICIPIO,
    geoUrl: GEO_URL_BY_SCOPE.rmc,
    rankTitle: 'Municípios por saldo',
  },
}

export type SaldoItem = {
  label: string
  saldo: number
}

export type ProfileLeader = SaldoItem & {
  dimension: string
}

const PROFILE_DIMENSIONS = [
  { key: GOLD_COLUMNS.GRAUDEINSTRUCAO, title: 'Grau de instrução' },
  { key: GOLD_COLUMNS.FAIXA_ETARIA, title: 'Faixa etária' },
  { key: GOLD_COLUMNS.SEXO, title: 'Sexo' },
] as const

export type TerritorialComposition = {
  remuneration: TerritorialSalarySummary | null
  sectors: SaldoItem[]
  occupations: SaldoItem[]
  profile: ProfileLeader[]
}

export function finiteSaldo(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function topBySaldo(
  rows: GoldRow[] | null | undefined,
  labelKey: string,
  limit = 3,
): SaldoItem[] {
  const items: SaldoItem[] = []
  for (const row of rows ?? []) {
    const label = String(row[labelKey] ?? '').trim()
    const saldo = finiteSaldo(row[GOLD_COLUMNS.SALDO])
    if (!label || saldo === null) continue
    items.push({ label, saldo })
  }
  items.sort((left, right) => right.saldo - left.saldo || left.label.localeCompare(right.label, 'pt-BR'))
  return items.slice(0, Math.max(0, limit))
}

/** Maior saldo único. Empate não elege um destaque. */
export function uniqueSaldoLeader(
  rows: GoldRow[] | null | undefined,
  labelKey: string,
): SaldoItem | null {
  const [first, second] = topBySaldo(rows, labelKey, 2)
  if (!first) return null
  if (second && second.saldo === first.saldo) return null
  return first
}

export function rankTerritorialUnits(
  rows: GoldRow[] | null | undefined,
  scope: Scope,
  limit = 5,
): SaldoItem[] {
  return topBySaldo(rows, TERRITORIAL_GEOGRAPHY[scope].labelKey, limit)
}

export function profileLeaders(
  profiles: Record<string, GoldRow[] | null | undefined> | null | undefined,
): ProfileLeader[] {
  if (!profiles) return []
  return PROFILE_DIMENSIONS.flatMap((dimension) => {
    const leader = uniqueSaldoLeader(profiles[dimension.key], dimension.key)
    if (!leader) return []
    return [{ ...leader, dimension: dimension.title }]
  })
}

export function territorialComposition(
  overview: Pick<OverviewResponse, 'rankings' | 'profiles' | 'salary_summary'> | null,
): TerritorialComposition {
  if (!overview) {
    return { remuneration: null, sectors: [], occupations: [], profile: [] }
  }
  return {
    remuneration: getTerritorialSalarySummary(overview, DEFAULT_SALARY_MOVEMENT),
    sectors: topBySaldo(overview.rankings.setor, GOLD_COLUMNS.SECAO, 3),
    occupations: topBySaldo(overview.rankings.ocupacao, GOLD_COLUMNS.CBO_OCUPACAO, 3),
    profile: profileLeaders(overview.profiles),
  }
}
