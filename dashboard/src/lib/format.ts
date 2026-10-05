export function formatInt(n: unknown): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(
    Number(n),
  )
}

/** Inteiro com sinal explícito (+/−), exceto zero. */
export function formatSignedInt(n: unknown): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(Number(n))
}

export function formatCompact(n: unknown): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(n))
}

export function formatCurrencyBRL(n: unknown): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(n))
}

export function labelScope(scope: string): string {
  if (scope === 'br') return 'Brasil'
  if (scope === 'pr') return 'Paraná'
  if (scope === 'rmc') return 'RMC'
  return scope
}

export function formatCompetencia(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

const SHORT_MONTH = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

/** Label curto para comparativos (ex.: jan/26). */
export function shortCompetenciaLabel(mes: number, ano: number): string {
  const month = SHORT_MONTH[mes - 1] ?? String(mes).padStart(2, '0')
  const yearSuffix = String(ano).slice(-2)
  return `${month}/${yearSuffix}`
}
