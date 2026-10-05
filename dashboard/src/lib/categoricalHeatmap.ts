import { GOLD_COLUMNS } from '../api/goldColumns'
import type { GoldRow } from '../api/types'
import { formatCurrencyBRL, formatInt, formatSignedInt } from './format'

export type HeatmapCell = {
  row: string
  col: string
  value: number | null
  metrics: GoldRow
}

export type HeatmapData = {
  rowLabels: string[]
  colLabels: string[]
  cells: HeatmapCell[]
  min: number
  max: number
  valueKey: string
}

const FAIXA_ETARIA_ORDER = [
  'Até 17 anos',
  '18 a 24 anos',
  '25 a 29 anos',
  '30 a 39 anos',
  '40 a 49 anos',
  '50 a 64 anos',
  '65 anos ou mais',
]

const SEXO_ORDER = ['Mulher', 'Homem']

export const HEATMAP_VALUE_KEY = GOLD_COLUMNS.SALARIO_MEDIO

export const HEATMAP_TOOLTIP_METRICS: {
  key: string
  label: string
  format: (n: unknown) => string
}[] = [
  { key: GOLD_COLUMNS.SALDO, label: 'Saldo', format: formatSignedInt },
  { key: GOLD_COLUMNS.ADMISSOES, label: 'Admissões', format: formatInt },
  { key: GOLD_COLUMNS.DESLIGAMENTOS, label: 'Desligamentos', format: formatInt },
  { key: GOLD_COLUMNS.SALARIO_MEDIO, label: 'Salário médio', format: formatCurrencyBRL },
  { key: GOLD_COLUMNS.SALARIO_MEDIANO, label: 'Salário mediano', format: formatCurrencyBRL },
  { key: GOLD_COLUMNS.N_SALARIOS_VALIDOS, label: 'Salários válidos', format: formatInt },
  { key: GOLD_COLUMNS.SALARIO_P25, label: 'P25', format: formatCurrencyBRL },
  { key: GOLD_COLUMNS.SALARIO_P75, label: 'P75', format: formatCurrencyBRL },
  { key: GOLD_COLUMNS.SALARIO_MIN, label: 'Mínimo', format: formatCurrencyBRL },
  { key: GOLD_COLUMNS.SALARIO_MAX, label: 'Máximo', format: formatCurrencyBRL },
]

function sortLabels(key: string, labels: string[]): string[] {
  const unique = [...new Set(labels.filter(Boolean))]
  if (key === GOLD_COLUMNS.SEXO) {
    return unique.sort((a, b) => {
      const ia = SEXO_ORDER.indexOf(a)
      const ib = SEXO_ORDER.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'pt-BR')
    })
  }
  if (key === GOLD_COLUMNS.FAIXA_ETARIA) {
    return unique.sort((a, b) => {
      const ia = FAIXA_ETARIA_ORDER.indexOf(a)
      const ib = FAIXA_ETARIA_ORDER.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'pt-BR')
    })
  }
  return unique.sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function buildCategoricalHeatmap(
  rows: GoldRow[],
  rowKey: string,
  colKey: string,
  valueKey: string = HEATMAP_VALUE_KEY,
): HeatmapData {
  const rowLabels = sortLabels(rowKey, rows.map((r) => String(r[rowKey] ?? '')))
  const colLabels = sortLabels(colKey, rows.map((r) => String(r[colKey] ?? '')))

  const cells: HeatmapCell[] = []
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const row of rows) {
    const rowLabel = String(row[rowKey] ?? '')
    const colLabel = String(row[colKey] ?? '')
    const raw = row[valueKey]
    const value =
      raw === null || raw === undefined || Number.isNaN(Number(raw)) ? null : Number(raw)
    if (value !== null) {
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    cells.push({ row: rowLabel, col: colLabel, value, metrics: row })
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 0
  }

  return { rowLabels, colLabels, cells, min, max, valueKey }
}

export function heatmapCellKey(row: string, col: string): string {
  return `${row}\0${col}`
}

/** Escala dark → ciano coerente com o dashboard. */
export function heatmapColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const low = { r: 26, g: 32, b: 48 }
  const mid = { r: 30, g: 64, b: 110 }
  const high = { r: 34, g: 211, b: 238 }
  const blend = (a: number, b: number, u: number) => Math.round(a + (b - a) * u)
  if (clamped <= 0.5) {
    const u = clamped / 0.5
    return `rgb(${blend(low.r, mid.r, u)}, ${blend(low.g, mid.g, u)}, ${blend(low.b, mid.b, u)})`
  }
  const u = (clamped - 0.5) / 0.5
  return `rgb(${blend(mid.r, high.r, u)}, ${blend(mid.g, high.g, u)}, ${blend(mid.b, high.b, u)})`
}

export function heatmapValueRatio(value: number | null, min: number, max: number): number | null {
  if (value === null) return null
  if (max === min) return 0.65
  return (value - min) / (max - min)
}
