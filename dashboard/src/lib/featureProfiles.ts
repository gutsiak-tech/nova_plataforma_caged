export type ProfileValueRow = {
  label: string
  value: number | null
}

export type ProfileComparisonRow = {
  label: string
  value: number
  share: number | null
  width: string | null
}

/** Ordem etária da classificação institucional. Rótulos ausentes no payload não são criados. */
export const FEATURE_AGE_ORDER = [
  'Até 17 anos',
  'Menos de 18 anos',
  '18 a 24 anos',
  '25 a 29 anos',
  '30 a 39 anos',
  '40 a 49 anos',
  '50 a 64 anos',
  '65 anos ou mais',
  'Ignorado',
  'Não Informado',
  'Não identificado',
] as const

/**
 * Escada de escolaridade da base. "Pós-Graduação completa" existe no dicionário
 * e no payload; fica entre superior completo e mestrado. Rótulos não são renomeados.
 */
export const FEATURE_SCHOOLING_ORDER = [
  'Analfabeto',
  'Até 5ª Incompleto',
  '5ª Completo Fundamental',
  '6ª a 9ª Fundamental',
  'Fundamental Completo',
  'Médio Incompleto',
  'Médio Completo',
  'Superior Incompleto',
  'Superior Completo',
  'Pós-Graduação completa',
  'Mestrado',
  'Doutorado',
  'Não Identificado',
] as const

function foldProfileLabel(label: string): string {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

/** Ordena só as linhas recebidas. Categorias fora da escada permanecem, na ordem original, ao final. */
export function orderProfileRows<T extends { label: string }>(rows: readonly T[], rank: readonly string[]): T[] {
  const index = new Map<string, number>()
  rank.forEach((label, position) => {
    const key = foldProfileLabel(label)
    if (!index.has(key)) index.set(key, position)
  })
  return rows
    .map((row, original) => ({
      row,
      original,
      position: index.get(foldProfileLabel(row.label)) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => left.position - right.position || left.original - right.original)
    .map((item) => item.row)
}

/** Largura na escala absoluta 0–100. Participação nula não vira 0%. */
export function profileShareWidth(share: number | null): string | null {
  if (share == null || !Number.isFinite(share)) return null
  const percent = Math.min(100, Math.max(0, share * 100))
  return `${Number(percent.toFixed(4))}%`
}

/**
 * Mesma participação de antes: admissão da linha / soma das admissões não nulas do bloco.
 * Não normaliza pelo maior valor. Null continua fora; zero explícito permanece.
 */
export function profileComparisonRows(
  rows: readonly ProfileValueRow[],
  order?: readonly string[],
): ProfileComparisonRow[] {
  const present = rows.filter((row): row is { label: string; value: number } => row.value != null)
  const ordered = order ? orderProfileRows(present, order) : present
  const total = ordered.reduce((sum, row) => sum + row.value, 0)
  return ordered.map((row) => {
    const share = total > 0 ? row.value / total : null
    return {
      label: row.label,
      value: row.value,
      share,
      width: profileShareWidth(share),
    }
  })
}
