import { GOLD_COLUMNS } from '../api/goldColumns'
import type { SalaryMovement } from '../api/types'

type SalarySummarySource = {
  salary_summary?: {
    movement?: unknown
    n?: unknown
    mean?: unknown
    median?: unknown
  } | null
}

export type TerritorialSalarySummary = {
  movement: SalaryMovement
  n: number
  mean: number | null
  median: number | null
}

export const DEFAULT_SALARY_MOVEMENT: SalaryMovement = 'admissao'

export const SALARY_METHODOLOGY =
  'Metodologia salarial: vínculos com salário entre 0,3 e 150 salários mínimos, excluídos contratos intermitentes. Valores nominais.'

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getTerritorialSalarySummary(
  source: SalarySummarySource,
  movement: SalaryMovement,
): TerritorialSalarySummary | null {
  const summary = source.salary_summary
  if (!summary || summary.movement !== movement) return null
  const n = finiteNumber(summary.n)
  if (n === null || n < 0) return null
  return {
    movement,
    n,
    mean: finiteNumber(summary.mean),
    median: finiteNumber(summary.median),
  }
}

export function getTerritorialSalaryMedian(
  source: SalarySummarySource,
  movement: SalaryMovement = DEFAULT_SALARY_MOVEMENT,
): number | null {
  return getTerritorialSalarySummary(source, movement)?.median ?? null
}

export function salaryMovementLabel(movement: SalaryMovement): string {
  return movement === 'admissao' ? 'Admissões' : 'Desligamentos'
}

export function salaryColumnsForDisplay(columns: string[]): string[] {
  return columns.filter(
    (column) =>
      column !== GOLD_COLUMNS.SALARIO_MIN && column !== GOLD_COLUMNS.SALARIO_MAX,
  )
}
