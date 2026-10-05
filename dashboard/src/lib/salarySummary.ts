type SalarySummarySource = {
  salary_summary?: {
    median?: unknown
  } | null
}

export function getTerritorialSalaryMedian(source: SalarySummarySource): number | null {
  const median = source.salary_summary?.median
  return typeof median === 'number' && Number.isFinite(median) ? median : null
}
