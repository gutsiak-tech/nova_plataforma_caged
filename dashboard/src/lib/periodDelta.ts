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
  options: { includeMissingAsZero?: boolean } = {},
): PeriodDeltaDatum[] {
  function indexRows(rows: GoldRow[]) {
    const index = new Map<string, number>()
    for (const row of rows) {
      const name = String((row as Record<string, unknown>)[nameKey] ?? '')
      if (!name) continue
      const value = Number((row as Record<string, unknown>)[GOLD_COLUMNS.SALDO] ?? NaN)
      if (!Number.isFinite(value)) continue
      index.set(name, value)
    }
    return index
  }

  const previousMap = indexRows(previousRows)
  const currentMap = indexRows(currentRows)
  const names = options.includeMissingAsZero
    ? new Set([...previousMap.keys(), ...currentMap.keys()])
    : new Set(currentMap.keys())

  const candidates: PeriodDeltaDatum[] = []
  for (const name of names) {
    const previous = previousMap.get(name)
    const current = currentMap.get(name)
    if (!options.includeMissingAsZero && (previous === undefined || current === undefined)) {
      continue
    }
    const previousValue = previous ?? 0
    const currentValue = current ?? 0
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
