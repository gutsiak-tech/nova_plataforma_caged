import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'
import type { Competencia, OverviewResponse, Scope } from '../../api/types'
import { formatCurrencyBRL, formatInt, formatSignedInt } from '../../lib/format'
import {
  territorialExecutiveCopy,
  territorialKpis,
  territoryOption,
  topSectorAdmissions,
  uniqueLeadingSector,
} from '../../lib/territorialSummary'
type TerritorySummaryPanelProps = {
  scope: Scope
  overview: OverviewResponse | null
  loading: boolean
  error: boolean
  onRetry: () => void
  onOpen: () => void
  competenceLabel: string
  competencia: string
  competencias: Competencia[]
  onCompetenciaChange: (competencia: string) => void
  mapSlot: ReactNode
  competenceHost?: HTMLElement | null
  suspendSkeleton?: boolean
}

function Kpi({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint: string
  className?: string
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
        {label}
      </p>
      <p className="mt-1 truncate text-[1.65rem] font-semibold leading-none tracking-tight text-[color:var(--ds-brand-white)] tabular-nums sm:text-[1.85rem]">
        {value}
      </p>
      <p className="mt-1 text-xs leading-4 text-white/55">{hint}</p>
    </div>
  )
}

export function TerritorySummaryPanel({
  scope,
  overview,
  loading,
  error,
  onRetry,
  onOpen,
  competenceLabel,
  competencia,
  competencias,
  onCompetenciaChange,
  mapSlot,
  competenceHost = null,
  suspendSkeleton = false,
}: TerritorySummaryPanelProps) {
  const territory = territoryOption(scope)
  const kpis = overview ? territorialKpis(overview) : null
  const sectors = topSectorAdmissions(overview?.rankings.setor, 3)
  const maxSector = Math.max(...sectors.map((sector) => sector.value), 1)
  const competenceControl = (
    <label
      data-territorial-competence=""
      className={
        competenceHost
          ? 'text-[10px] font-semibold uppercase tracking-[0.16em] text-[#727d91]'
          : 'shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60'
      }
    >
      Competência
      <select
        value={competencia}
        onChange={(event) => onCompetenciaChange(event.target.value)}
        className={
          competenceHost
            ? 'mt-0.5 block w-[11.5rem] border-0 border-b border-[#1a2130] bg-transparent pb-0.5 text-sm font-semibold normal-case tracking-normal text-[#1a2130] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617] sm:w-52'
            : 'scheme-dark mt-1 block w-full min-w-[14rem] border-0 border-b border-white/40 bg-transparent pb-0.5 text-base font-semibold normal-case tracking-normal text-[color:var(--ds-brand-white)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-brand-gold)]'
        }
      >
        {competencias.map((item) => (
          <option
            key={item.competencia}
            value={item.competencia}
            className="bg-[color:var(--ds-brand-navy-deep)] text-[color:var(--ds-brand-white)]"
          >
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
  const copy = kpis
    ? territorialExecutiveCopy({
        territoryName: territory.name,
        competenceLabel,
        saldo: kpis.saldo,
        leadingSector: uniqueLeadingSector(topSectorAdmissions(overview?.rankings.setor)),
      })
    : null

  return (
    <article
      aria-live="polite"
      className="flex h-auto flex-col rounded-[1.15rem] border border-white/10 bg-[color:var(--ds-brand-navy-deep)] px-6 py-[clamp(0.65rem,1.15vh,1rem)] shadow-[0_18px_50px_rgba(26,33,48,0.045)] sm:px-8 lg:px-10"
    >
      <header className="flex shrink-0 flex-col gap-4 border-b border-white/15 pb-[clamp(0.45rem,0.8vh,0.65rem)] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ds-brand-gold)]">
            {territory.kicker}
          </p>
          <h2 className="mt-0.5 text-4xl font-semibold tracking-[-0.035em] text-[color:var(--ds-brand-white)] sm:text-5xl">
            {territory.name}
          </h2>
          <p className="mt-0.5 text-base text-white/70">{territory.subtitle}</p>
          {copy?.balance ? (
            <p className="mt-[clamp(0.2rem,0.4vh,0.35rem)] max-w-xl text-lg font-medium leading-snug tracking-[-0.02em] text-[color:var(--ds-brand-white)] sm:text-xl sm:leading-7">
              {copy.balance}
            </p>
          ) : null}
        </div>
        {competenceHost ? createPortal(competenceControl, competenceHost) : competenceControl}
      </header>

      {error ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-4 py-16">
          <p className="text-sm text-white/70">
            Não foi possível carregar o panorama deste território.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-[color:var(--ds-brand-white)] underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : !kpis ? (
        suspendSkeleton || !loading ? null : (
          <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse bg-[#efece4]" />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mt-[clamp(1.05rem,2.1vh,1.4rem)] grid min-h-0 grid-cols-1 items-center gap-5 lg:grid-cols-[minmax(11rem,30%)_minmax(0,1fr)] lg:gap-x-[5%] lg:gap-y-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:flex lg:flex-col lg:justify-center lg:gap-4">
              <Kpi
                label="Saldo"
                value={formatSignedInt(kpis.saldo)}
                hint="Movimento líquido"
                className="lg:border-b lg:border-white/15 lg:pb-2"
              />
              <Kpi
                label="Admissões"
                value={formatInt(kpis.admissoes)}
                hint="Vínculos iniciados"
                className="lg:border-b lg:border-white/15 lg:py-2"
              />
              <Kpi
                label="Desligamentos"
                value={formatInt(kpis.desligamentos)}
                hint="Vínculos encerrados"
                className="lg:border-b lg:border-white/15 lg:py-2"
              />
              <Kpi
                label="Salário médio nominal"
                value={formatCurrencyBRL(kpis.salarioMedio)}
                hint="Admissões · metodologia institucional"
                className="lg:pt-2"
              />
            </div>
            <div className="flex min-h-[12rem] items-center justify-center">{mapSlot}</div>
          </div>

          <footer className="mt-[clamp(1.05rem,2.1vh,1.4rem)] flex shrink-0 flex-col gap-3 border-t border-white/15 pt-[clamp(0.35rem,0.55vh,0.45rem)] lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                Maiores admissões por setor
              </p>
              {copy?.sector ? (
                <p className="mt-0.5 max-w-3xl text-sm leading-5 text-white/75">{copy.sector}</p>
              ) : null}
              {sectors.length === 0 ? (
                <p className="mt-2 text-sm text-white/55">
                  Sem ranking setorial nesta competência.
                </p>
              ) : (
                <ol className="mt-1.5 grid gap-x-6 gap-y-2 sm:grid-cols-3">
                  {sectors.map((sector, index) => (
                    <li key={sector.label} className="min-w-0">
                      <p className="text-[11px] font-semibold leading-4 tracking-[0.14em] text-[color:var(--ds-brand-gold)]">
                        0{index + 1}
                      </p>
                      <p className="truncate text-sm font-medium leading-5 text-[color:var(--ds-brand-white)]" title={sector.label}>
                        {sector.label}
                      </p>
                      <p className="text-base font-semibold leading-5 tabular-nums tracking-tight text-[color:var(--ds-brand-white)]">
                        {formatInt(sector.value)}
                      </p>
                      <div className="mt-0.5 h-px bg-white/20">
                        <div
                          className="h-px bg-[color:var(--ds-brand-white)]"
                          style={{ width: `${(sector.value / maxSector) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="group inline-flex shrink-0 items-center gap-3 self-end text-sm font-semibold text-[color:var(--ds-brand-white)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-brand-gold)]"
            >
              <span className="border-b border-white/50 pb-0.5">Ver mais</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-[color:var(--ds-brand-white)] transition duration-200 group-hover:bg-[color:var(--ds-brand-white)] group-hover:text-[color:var(--ds-brand-navy-deep)]">
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </span>
            </button>
          </footer>
        </>
      )}
    </article>
  )
}
