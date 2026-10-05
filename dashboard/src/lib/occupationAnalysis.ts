import { GOLD_COLUMNS } from '../api/goldColumns'
import type { GoldRow } from '../api/types'
import { buildPeriodDeltaData, type PeriodDeltaDatum } from './periodDelta'

export type OccupationTreemapNode = {
  name: string
  value: number
  signedValue: number
}

export function buildOccupationDeltaData(
  previousRows: GoldRow[],
  currentRows: GoldRow[],
): PeriodDeltaDatum[] {
  return buildPeriodDeltaData(
    previousRows,
    currentRows,
    GOLD_COLUMNS.CBO_OCUPACAO,
    { includeMissingAsZero: true },
  )
}

export function buildOccupationTreemapNodes(
  rows: GoldRow[],
  limit = 40,
): OccupationTreemapNode[] {
  return rows
    .map((row) => {
      const name = String(row[GOLD_COLUMNS.CBO_OCUPACAO] ?? '—')
      const signedValue = Number(row[GOLD_COLUMNS.SALDO] ?? 0)
      return {
        name,
        value: Math.abs(signedValue),
        signedValue,
      }
    })
    .filter((node) => Number.isFinite(node.value) && node.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, limit)
}
