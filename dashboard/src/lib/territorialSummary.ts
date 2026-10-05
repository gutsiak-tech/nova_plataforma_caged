import { GOLD_COLUMNS } from '../api/goldColumns'
import type { GoldRow, OverviewResponse, Scope } from '../api/types'
import { DEFAULT_SALARY_MOVEMENT, getTerritorialSalarySummary } from './salarySummary'

export type TerritoryOption = {
  id: Scope
  name: string
  kicker: string
  subtitle: string
}

export const TERRITORY_OPTIONS: TerritoryOption[] = [
  {
    id: 'br',
    name: 'Brasil',
    kicker: 'Nacional',
    subtitle: 'Panorama do mercado de trabalho',
  },
  {
    id: 'pr',
    name: 'Paraná',
    kicker: 'Estadual',
    subtitle: 'Panorama do mercado de trabalho',
  },
  {
    id: 'rmc',
    name: 'RMC',
    kicker: 'Metropolitano',
    subtitle: 'Panorama do mercado de trabalho',
  },
]

export type TerritorialKpis = {
  saldo: number | null
  admissoes: number | null
  desligamentos: number | null
  salarioMedio: number | null
}

export type SectorAdmissionBar = {
  label: string
  value: number
}

export type TerritorialMovementPoint = {
  ano: number
  mes: number
  label: string
  admissoes: number | null
  desligamentos: number | null
  saldo: number | null
}

export type TerritorialExecutiveCopy = {
  balance: string | null
  sector: string | null
}

function metricNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function territoryOption(scope: Scope): TerritoryOption {
  return TERRITORY_OPTIONS.find((option) => option.id === scope) ?? TERRITORY_OPTIONS[0]
}

export function territorialKpis(overview: OverviewResponse): TerritorialKpis {
  const salary = getTerritorialSalarySummary(overview, DEFAULT_SALARY_MOVEMENT)
  return {
    saldo: metricNumber(overview.resumo?.[GOLD_COLUMNS.SALDO]),
    admissoes: metricNumber(overview.resumo?.[GOLD_COLUMNS.ADMISSOES]),
    desligamentos: metricNumber(overview.resumo?.[GOLD_COLUMNS.DESLIGAMENTOS]),
    salarioMedio: salary?.mean ?? null,
  }
}

export function topSectorAdmissions(
  rows: GoldRow[] | null | undefined,
  limit = 5,
): SectorAdmissionBar[] {
  return (rows ?? [])
    .map((row) => ({
      label: String(row[GOLD_COLUMNS.SECAO] ?? '').trim(),
      value: metricNumber(row[GOLD_COLUMNS.ADMISSOES]) ?? 0,
    }))
    .filter((row) => row.label.length > 0 && row.value > 0)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'pt-BR'))
    .slice(0, limit)
}

function formatScaled(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const [intPart, decPart] = rounded.toFixed(1).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === '0' ? grouped : `${grouped},${decPart}`
}

/** Magnitude de vínculos, sem sinal, a partir do número publicado. */
export function formatVinculosMagnitude(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const scaled = abs / 1_000_000
    const unit = Math.round(scaled * 10) / 10 === 1 ? 'milhão' : 'milhões'
    return `${formatScaled(scaled)} ${unit}`
  }
  if (abs >= 1_000) return `${formatScaled(abs / 1_000)} mil`
  return formatScaled(abs)
}

export function uniqueLeadingSector(sectors: SectorAdmissionBar[]): string | null {
  const [first, second] = sectors
  if (!first) return null
  if (second && second.value === first.value) return null
  return first.label
}

function competencePhrase(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ''
  return ` em ${trimmed.charAt(0).toLocaleLowerCase('pt-BR')}${trimmed.slice(1)}`
}

export function territorialExecutiveCopy(input: {
  territoryName: string
  competenceLabel: string
  saldo: number | null
  leadingSector: string | null
}): TerritorialExecutiveCopy {
  const when = competencePhrase(input.competenceLabel)
  let balance: string | null = null
  if (input.saldo !== null) {
    if (input.saldo > 0) {
      balance = `${input.territoryName} registrou saldo positivo de ${formatVinculosMagnitude(input.saldo)} vínculos${when}.`
    } else if (input.saldo < 0) {
      balance = `${input.territoryName} registrou saldo negativo de ${formatVinculosMagnitude(input.saldo)} vínculos${when}.`
    } else {
      balance = `${input.territoryName} registrou saldo igual a zero${when}.`
    }
  }

  const sector = input.leadingSector
    ? `${input.leadingSector} liderou as admissões na competência selecionada.`
    : null

  return { balance, sector }
}

export function territorialMovementPoint(
  month: { ano: number; mes: number; label: string },
  overview: OverviewResponse,
): TerritorialMovementPoint {
  const kpis = territorialKpis(overview)
  return {
    ano: month.ano,
    mes: month.mes,
    label: month.label,
    admissoes: kpis.admissoes,
    desligamentos: kpis.desligamentos,
    saldo: kpis.saldo,
  }
}
