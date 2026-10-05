import type { Competencia } from '../api/types'

export const COMPETENCIA_STORAGE_KEY = 'caged-dashboard:last-competencia'

export type CompetenciaQuery = {
  ano: number
  mes: number
}

type StoredCompetencia = CompetenciaQuery

export function normalizeAnoMes(
  ano: unknown,
  mes: unknown,
): CompetenciaQuery | null {
  const a = Number(ano)
  const m = Number(mes)
  if (!Number.isFinite(a) || !Number.isFinite(m)) return null
  if (!Number.isInteger(a) || !Number.isInteger(m)) return null
  if (m < 1 || m > 12) return null
  if (a < 1990 || a > 2100) return null
  return { ano: a, mes: m }
}

export function parseCompetenciaQuery(searchParams: URLSearchParams): CompetenciaQuery | null {
  const anoRaw = searchParams.get('ano')
  const mesRaw = searchParams.get('mes')
  if (anoRaw === null || mesRaw === null) return null
  return normalizeAnoMes(anoRaw, mesRaw)
}

export function findCompetenciaByAnoMes(
  items: Competencia[],
  ano: unknown,
  mes: unknown,
): Competencia | undefined {
  const target = normalizeAnoMes(ano, mes)
  if (!target) return undefined

  return items.find((item) => {
    const normalized = normalizeAnoMes(item.ano, item.mes)
    return (
      normalized?.ano === target.ano && normalized?.mes === target.mes
    )
  })
}

export function findCompetenciaByKey(
  items: Competencia[],
  competencia: string,
): Competencia | undefined {
  const normalized = competencia.trim()
  return items.find((item) => item.competencia === normalized)
}

export function readStoredCompetencia(): CompetenciaQuery | null {
  try {
    const raw = localStorage.getItem(COMPETENCIA_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCompetencia
    return normalizeAnoMes(parsed.ano, parsed.mes)
  } catch {
    return null
  }
}

export function writeStoredCompetencia(ano: number, mes: number): void {
  const normalized = normalizeAnoMes(ano, mes)
  if (!normalized) return

  try {
    localStorage.setItem(
      COMPETENCIA_STORAGE_KEY,
      JSON.stringify(normalized satisfies StoredCompetencia),
    )
  } catch {
    // private mode / quota — ignore
  }
}

/**
 * Priority: URL query -> localStorage -> API default -> latest item -> fallback.
 */
export function resolveInitialCompetencia(
  items: Competencia[],
  searchParams: URLSearchParams,
  apiDefault: Competencia | null,
  fallbackDefault: Competencia,
): Competencia {
  const fromUrl = parseCompetenciaQuery(searchParams)
  if (fromUrl) {
    const match = findCompetenciaByAnoMes(items, fromUrl.ano, fromUrl.mes)
    if (match) return match
  }

  const stored = readStoredCompetencia()
  if (stored) {
    const match = findCompetenciaByAnoMes(items, stored.ano, stored.mes)
    if (match) return match
  }

  if (apiDefault) {
    const match =
      findCompetenciaByAnoMes(items, apiDefault.ano, apiDefault.mes) ??
      findCompetenciaByKey(items, apiDefault.competencia)
    if (match) return match
  }

  if (items.length > 0) return items[items.length - 1]
  return fallbackDefault
}

/**
 * After /competencias loads: keep a valid in-flight user selection;
 * otherwise resolve from URL, storage and API default.
 */
export function pickCompetenciaAfterFetch(
  items: Competencia[],
  searchParams: URLSearchParams,
  currentSelected: Competencia,
  apiDefault: Competencia | null,
  fallbackDefault: Competencia,
): Competencia {
  const currentMatch =
    findCompetenciaByKey(items, currentSelected.competencia) ??
    findCompetenciaByAnoMes(items, currentSelected.ano, currentSelected.mes)

  if (currentMatch) {
    const stored = readStoredCompetencia()
    if (
      stored &&
      Number(stored.ano) === Number(currentMatch.ano) &&
      Number(stored.mes) === Number(currentMatch.mes)
    ) {
      return currentMatch
    }

    const fromUrl = parseCompetenciaQuery(searchParams)
    if (fromUrl) {
      const urlMatch = findCompetenciaByAnoMes(items, fromUrl.ano, fromUrl.mes)
      if (
        urlMatch &&
        urlMatch.competencia === currentMatch.competencia
      ) {
        return currentMatch
      }
    }

    if (!fromUrl) {
      return currentMatch
    }
  }

  return resolveInitialCompetencia(
    items,
    searchParams,
    apiDefault,
    fallbackDefault,
  )
}

export function buildCompetenciaSearchParams(
  base: URLSearchParams,
  ano: number,
  mes: number,
): URLSearchParams {
  const normalized = normalizeAnoMes(ano, mes)
  const next = new URLSearchParams(base)
  if (!normalized) return next
  next.set('ano', String(normalized.ano))
  next.set('mes', String(normalized.mes))
  return next
}

export function competenciaMatchesQuery(
  selected: Competencia,
  searchParams: URLSearchParams,
): boolean {
  const parsed = parseCompetenciaQuery(searchParams)
  if (!parsed) return false
  return (
    Number(parsed.ano) === Number(selected.ano) &&
    Number(parsed.mes) === Number(selected.mes)
  )
}

export function selectionMatchesStorage(selected: Competencia): boolean {
  const stored = readStoredCompetencia()
  if (!stored) return false
  return (
    Number(stored.ano) === Number(selected.ano) &&
    Number(stored.mes) === Number(selected.mes)
  )
}
