import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildFallbackCompetencias,
  buildFallbackDefault,
  fetchCompetencias,
} from '../api/gold'
import type { Competencia } from '../api/types'
import {
  buildCompetenciaSearchParams,
  competenciaMatchesQuery,
  findCompetenciaByAnoMes,
  parseCompetenciaQuery,
  pickCompetenciaAfterFetch,
  resolveInitialCompetencia,
  selectionMatchesStorage,
  writeStoredCompetencia,
} from '../lib/competenciaPersistence'
import { scheduleAsyncState } from '../lib/scheduleAsyncState'

type MonthContextValue = {
  ano: number
  mes: number
  competencia: string
  label: string
  competencias: Competencia[]
  previousCompetencia: Competencia | null
  setCompetencia: (competencia: string) => void
  loading: boolean
  fetchError: boolean
}

const MonthContext = createContext<MonthContextValue | null>(null)

function findPrevious(
  competencias: Competencia[],
  current: Competencia,
): Competencia | null {
  const idx = competencias.findIndex((c) => c.competencia === current.competencia)
  return idx > 0 ? competencias[idx - 1] : null
}

function readLocationSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedRef = useRef<Competencia | null>(null)
  const skipUrlSyncRef = useRef(false)
  const initialFetchDoneRef = useRef(false)

  const fallbackItems = useMemo(() => buildFallbackCompetencias(), [])
  const fallbackDefault = useMemo(
    () => buildFallbackDefault() ?? fallbackItems[0],
    [fallbackItems],
  )

  const [competencias, setCompetencias] = useState<Competencia[]>(fallbackItems)
  const [selected, setSelected] = useState<Competencia>(() =>
    resolveInitialCompetencia(
      fallbackItems,
      readLocationSearchParams(),
      null,
      fallbackDefault,
    ),
  )
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const syncUrlToSelection = useCallback(
    (next: Competencia) => {
      setSearchParams(
        (current) => {
          if (competenciaMatchesQuery(next, current)) return current
          return buildCompetenciaSearchParams(current, next.ano, next.mes)
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const applySelection = useCallback(
    (next: Competencia) => {
      skipUrlSyncRef.current = true
      selectedRef.current = next
      setSelected(next)
      writeStoredCompetencia(next.ano, next.mes)
      syncUrlToSelection(next)
      queueMicrotask(() => {
        skipUrlSyncRef.current = false
      })
    },
    [syncUrlToSelection],
  )

  useEffect(() => {
    let cancelled = false

    fetchCompetencias()
      .then((res) => {
        if (cancelled) return
        setFetchError(false)
        const items = res.items.length > 0 ? res.items : fallbackItems
        setCompetencias(items)

        const currentParams = readLocationSearchParams()
        const currentSelected = selectedRef.current ?? selected
        const next = pickCompetenciaAfterFetch(
          items,
          currentParams,
          currentSelected,
          res.default,
          fallbackDefault,
        )

        selectedRef.current = next
        setSelected(next)
        writeStoredCompetencia(next.ano, next.mes)

        if (!initialFetchDoneRef.current) {
          initialFetchDoneRef.current = true
          skipUrlSyncRef.current = true
          syncUrlToSelection(next)
          queueMicrotask(() => {
            skipUrlSyncRef.current = false
          })
        }
      })
      .catch(() => {
        if (cancelled) return
        setFetchError(true)
        setCompetencias(fallbackItems)

        const currentParams = readLocationSearchParams()
        const currentSelected = selectedRef.current ?? selected
        const next = pickCompetenciaAfterFetch(
          fallbackItems,
          currentParams,
          currentSelected,
          fallbackDefault,
          fallbackDefault,
        )

        selectedRef.current = next
        setSelected(next)
        writeStoredCompetencia(next.ano, next.mes)

        if (!initialFetchDoneRef.current) {
          initialFetchDoneRef.current = true
          skipUrlSyncRef.current = true
          syncUrlToSelection(next)
          queueMicrotask(() => {
            skipUrlSyncRef.current = false
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // selectedRef holds latest pick; do not re-fetch when selected changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time competencias load
  }, [fallbackDefault, fallbackItems, syncUrlToSelection])

  useEffect(() => {
    if (loading || skipUrlSyncRef.current) return

    const parsed = parseCompetenciaQuery(searchParams)
    if (!parsed) return

    const found = findCompetenciaByAnoMes(competencias, parsed.ano, parsed.mes)
    if (!found) return

    let cancelled = false
    const isCancelled = () => cancelled

    scheduleAsyncState(isCancelled, () => {
      setSelected((current) => {
        if (current.competencia === found.competencia) return current

        if (selectionMatchesStorage(current)) {
          skipUrlSyncRef.current = true
          syncUrlToSelection(current)
          queueMicrotask(() => {
            skipUrlSyncRef.current = false
          })
          return current
        }

        selectedRef.current = found
        writeStoredCompetencia(found.ano, found.mes)
        return found
      })
    })

    return () => {
      cancelled = true
    }
  }, [competencias, loading, searchParams, syncUrlToSelection])

  const setCompetencia = useCallback(
    (competencia: string) => {
      const found = competencias.find((item) => item.competencia === competencia)
      if (found) applySelection(found)
    },
    [applySelection, competencias],
  )

  const previousCompetencia = useMemo(
    () => findPrevious(competencias, selected),
    [competencias, selected],
  )

  const value = useMemo(
    () => ({
      ano: selected.ano,
      mes: selected.mes,
      competencia: selected.competencia,
      label: selected.label,
      competencias,
      previousCompetencia,
      setCompetencia,
      loading,
      fetchError,
    }),
    [competencias, fetchError, loading, previousCompetencia, selected, setCompetencia],
  )

  return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>
}

export function useMonth(): MonthContextValue {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth must be used within MonthProvider')
  return ctx
}
