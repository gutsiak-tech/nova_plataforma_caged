import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { fetchOverview } from '../api/gold'
import type { OverviewResponse, Scope } from '../api/types'
import { TerritorySummaryPanel } from '../components/territorial/TerritorySummaryPanel'
import { useMonth } from '../context/MonthContext'
import { useScope } from '../context/ScopeContext'
import { territorialSlug } from '../lib/territorialRoute'
import { TERRITORY_OPTIONS } from '../lib/territorialSummary'

const SCOPES: Scope[] = ['br', 'pr', 'rmc']

export function TerritorialLandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setScope } = useScope()
  const { ano, mes, label, competencia, competencias, setCompetencia } = useMonth()
  const [selected, setSelected] = useState<Scope>('br')
  const [retryKey, setRetryKey] = useState(0)
  const requestKey = `${ano}-${mes}-${retryKey}`
  const [loaded, setLoaded] = useState<{
    key: string
    overviews: Partial<Record<Scope, OverviewResponse>>
    error: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const key = requestKey

    Promise.all(SCOPES.map((scope) => fetchOverview(scope, ano, mes)))
      .then((results) => {
        if (cancelled) return
        setLoaded({
          key,
          overviews: Object.fromEntries(results.map((result) => [result.scope, result])),
          error: false,
        })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, overviews: {}, error: true })
      })

    return () => {
      cancelled = true
    }
  }, [ano, mes, requestKey])

  const ready = loaded?.key === requestKey
  const overviews = ready ? loaded.overviews : {}
  const loading = !ready
  const error = ready && loaded.error

  function openDetailedView() {
    setScope(selected)
    navigate({
      pathname: `/territorial/${territorialSlug(selected)}`,
      search: searchParams.toString(),
    })
  }

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#1a2130] lg:h-dvh">
      <div className="grid min-h-screen px-5 py-5 sm:px-8 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(20rem,24%)_minmax(0,1fr)] lg:gap-x-12 lg:px-10 lg:py-[clamp(0.75rem,1.5vh,1.15rem)] xl:gap-x-16">
        <section className="flex flex-col py-2 lg:h-full lg:min-h-0 lg:py-1">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/estudio_logo.png"
                alt=""
                className="h-11 w-11 rounded-xl"
                aria-hidden
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#727d91]">
                  CAGED
                </p>
                <p className="text-sm font-semibold">Plataforma analítica</p>
              </div>
            </div>
            <Link
              to={{ pathname: '/', search: searchParams.toString() }}
              className="text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline"
            >
              Painel analítico
            </Link>
          </header>

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
                    onClick={() => setSelected(option.id)}
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
          initial={{ opacity: 0 }}
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
          />
        </motion.section>
      </div>
    </div>
  )
}
