import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import type { OverviewResponse, Scope } from '../api/types'
import { TerritorySummaryPanel } from '../components/territorial/TerritorySummaryPanel'
import {
  loadLandingFirstPaint,
  peekLandingFirstPaint,
  type LandingFirstPaint,
} from '../components/territorial/territorialFirstPaint'
import { useMonth } from '../context/MonthContext'
import { useScope } from '../context/ScopeContext'
import { territorialDetailLocation } from '../lib/territorialPose'
import { scheduleAsyncState } from '../lib/scheduleAsyncState'
import { TERRITORY_OPTIONS } from '../lib/territorialSummary'

export function TerritorialLandingPage({
  selected,
  onSelectedChange,
  mapSlot,
  initialPaint = null,
  active = true,
  competenceHold = false,
  competenceHost = null,
  onCompetenceSettled,
}: {
  selected: Scope
  onSelectedChange: (scope: Scope) => void
  mapSlot: ReactNode
  initialPaint?: LandingFirstPaint | null
  active?: boolean
  competenceHold?: boolean
  competenceHost?: HTMLElement | null
  onCompetenceSettled?: (monthKey: string) => void
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setScope } = useScope()
  const { ano, mes, label, competencia, competencias, setCompetencia } = useMonth()
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = `${ano}-${mes}-${retryKey}`
  const [loaded, setLoaded] = useState<{
    key: string
    overviews: Partial<Record<Scope, OverviewResponse>>
    error: boolean
  } | null>(() => {
    if (initialPaint) {
      return {
        key: initialPaint.key,
        overviews: initialPaint.overviews,
        error: initialPaint.error,
      }
    }
    const cached = peekLandingFirstPaint(ano, mes)
    return cached
      ? { key: cached.key, overviews: cached.overviews, error: cached.error }
      : null
  })
  const skipReadyFetch = useRef(loaded?.key === requestKey)
  const [cardEntered, setCardEntered] = useState(false)
  if (retryKey === 0) {
    const cached = peekLandingFirstPaint(ano, mes)
    if (cached && loaded?.key !== requestKey) {
      setLoaded({ key: requestKey, overviews: cached.overviews, error: cached.error })
    }
  }

  useEffect(() => {
    if (skipReadyFetch.current) {
      skipReadyFetch.current = false
      return
    }
    let cancelled = false
    const key = requestKey

    loadLandingFirstPaint(ano, mes, { bypassCache: retryKey > 0 }).then((result) => {
      if (cancelled) return
      setLoaded({ key, overviews: result.overviews, error: result.error })
    })

    return () => {
      cancelled = true
    }
  }, [ano, mes, requestKey, retryKey])

  useEffect(() => {
    scheduleAsyncState(
      () => false,
      () => setCardEntered(true),
    )
  }, [])

  const ready = loaded?.key === requestKey
  const held = competenceHold && !ready && loaded != null
  const visible = ready || held ? loaded : null
  const overviews = visible?.overviews ?? {}
  const loading = !ready && !held
  const error = visible?.error ?? false

  useLayoutEffect(() => {
    if (!active || !ready) return
    onCompetenceSettled?.(`${ano}-${mes}`)
  }, [active, ready, ano, mes, onCompetenceSettled])

  function openDetailedView() {
    setScope(selected)
    navigate(territorialDetailLocation(selected, searchParams.toString()))
  }

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#1a2130] lg:h-dvh">
      <div className="grid min-h-screen px-5 py-5 sm:px-8 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(20rem,24%)_minmax(0,1fr)] lg:gap-x-12 lg:px-10 lg:py-[clamp(0.75rem,1.5vh,1.15rem)] xl:gap-x-16">
        <section className="flex flex-col py-2 lg:h-full lg:min-h-0 lg:py-1">
          <div className="h-12 shrink-0" data-territorial-brand-slot="" aria-hidden />

          <div className="flex flex-1 flex-col justify-center py-10 lg:justify-start lg:py-0 lg:pt-[clamp(1.25rem,5vh,3rem)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7b12]">
              Navegação territorial
            </p>
            <div
              className="mt-8 flex flex-col gap-3"
              role="radiogroup"
              aria-label="Territórios"
            >
              {TERRITORY_OPTIONS.map((option) => {
                const active = option.id === selected
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSelectedChange(option.id)}
                    className={clsx(
                      'group flex items-center gap-4 py-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]',
                      active ? 'text-[#1a2130]' : 'text-[#c5c9d1] hover:text-[#8b93a3]',
                    )}
                  >
                    <span
                      className={clsx(
                        'h-12 w-[3px] transition-colors',
                        active ? 'bg-[#ebc617]' : 'bg-transparent group-hover:bg-[#e6e1d6]',
                      )}
                      aria-hidden
                    />
                    <span
                      className={clsx(
                        'font-semibold leading-none tracking-[-0.04em] transition-all duration-200',
                        active
                          ? 'text-5xl sm:text-6xl lg:text-[4.75rem]'
                          : 'text-4xl sm:text-5xl lg:text-6xl',
                      )}
                    >
                      {option.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <motion.section
          key={selected}
          initial={cardEntered ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="mt-8 flex min-w-0 flex-col lg:mt-0 lg:h-full lg:min-h-0 lg:justify-center"
        >
          <TerritorySummaryPanel
            scope={selected}
            overview={overviews[selected] ?? null}
            loading={loading && !overviews[selected]}
            error={error}
            onRetry={() => setRetryKey((current) => current + 1)}
            onOpen={openDetailedView}
            competenceLabel={label}
            competencia={competencia}
            competencias={competencias}
            onCompetenciaChange={setCompetencia}
            mapSlot={mapSlot}
            competenceHost={active && competenceHold ? competenceHost : null}
            suspendSkeleton={competenceHold}
          />
        </motion.section>
      </div>
    </div>
  )
}
