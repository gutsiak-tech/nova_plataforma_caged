import { GOLD_COLUMNS } from '../api/goldColumns'
import type { GoldRow } from '../api/types'

export type PeriodDeltaDatum = {
  label: string
  previousValue: number
  currentValue: number
  deltaAbs: number
  deltaPct?: number
}

export function buildPeriodDeltaData(
  previousRows: GoldRow[],
  currentRows: GoldRow[],
  nameKey: string,
): PeriodDeltaDatum[] {
  const previousMap = new Map<string, number>()
  for (const r of previousRows) {
    const name = String((r as Record<string, unknown>)[nameKey] ?? '')
    if (!name) continue
    const v = Number((r as Record<string, unknown>)[GOLD_COLUMNS.SALDO] ?? NaN)
    if (!Number.isFinite(v)) continue
    previousMap.set(name, v)
  }

  const candidates: PeriodDeltaDatum[] = []
  for (const r of currentRows) {
    const name = String((r as Record<string, unknown>)[nameKey] ?? '')
    if (!name) continue
    const currentValue = Number((r as Record<string, unknown>)[GOLD_COLUMNS.SALDO] ?? NaN)
    if (!Number.isFinite(currentValue)) continue
    const previousValue = previousMap.get(name)
    if (previousValue === undefined) continue
    const deltaAbs = currentValue - previousValue
    const deltaPct =
      previousValue === 0 ? undefined : (deltaAbs / previousValue) * 100
    candidates.push({
      label: name,
      previousValue,
      currentValue,
      deltaAbs,
      deltaPct: Number.isFinite(deltaPct) ? deltaPct : undefined,
    })
  }

  const pos = candidates
    .filter((d) => d.deltaAbs > 0)
    .sort((a, b) => b.deltaAbs - a.deltaAbs)
    .slice(0, 8)
  const neg = candidates
    .filter((d) => d.deltaAbs < 0)
    .sort((a, b) => a.deltaAbs - b.deltaAbs)
    .slice(0, 8)

  return [...neg, ...pos].sort((a, b) => a.deltaAbs - b.deltaAbs)
}
