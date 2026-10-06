import type { OverviewResponse, Scope } from '../../api/types'
import { formatCurrencyBRL, formatSignedInt } from '../../lib/format'
import {
  territorialComposition,
  type SaldoItem,
} from '../../lib/territorialDetail'
import { territoryOption } from '../../lib/territorialSummary'

function ModuleTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7b12]">
      {children}
    </h2>
  )
}

function Unavailable({ children }: { children: string }) {
  return <p className="mt-2 text-sm text-[#8b93a3]">{children}</p>
}

function magnitudeWidth(saldo: number, maxAbs: number): string {
  if (maxAbs <= 0) return '0%'
  return `${(Math.abs(saldo) / maxAbs) * 100}%`
}

function SaldoList({ items }: { items: SaldoItem[] }) {
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.saldo)), 0)
  return (
    <ol className="territorial-saldo-list mt-2.5 space-y-2">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-[#1a2130]" title={item.label}>
              <span className="mr-2 text-[10px] font-semibold tracking-[0.14em] text-[#9a7b12]">
                0{index + 1}
              </span>
              {item.label}
            </p>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-[#1a2130]">
              {formatSignedInt(item.saldo)}
            </p>
          </div>
          <div className="mt-1 h-px bg-[#e4dfd4]">
            <div className="h-px bg-[#1a2130]" style={{ width: magnitudeWidth(item.saldo, maxAbs) }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function TerritorialDetailPanel({
  scope,
  competenceLabel,
  overview,
  loading,
  error,
  onRetry,
  rankTitle,
  ranking,
  rankingLoading,
  rankingError,
}: {
  scope: Scope
  competenceLabel: string
  overview: OverviewResponse | null
  loading: boolean
  error: boolean
  onRetry: () => void
  rankTitle: string
  ranking: SaldoItem[]
  rankingLoading: boolean
  rankingError: boolean
}) {
  const territory = territoryOption(scope)
  const composition = territorialComposition(overview)

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-live="polite">
        <p className="text-sm text-[#727d91]">Carregando composição territorial</p>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-16 animate-pulse bg-[#efece4]" />
        ))}
      </div>
    )
  }

  return (
    <div className="territorial-detail-stack flex flex-col gap-4">
      <header className="territorial-context">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a7b12]">
          {territory.kicker}
        </p>
        <h1 className="mt-1 text-[1.85rem] font-semibold leading-none tracking-[-0.04em] text-[#1a2130]">
          {territory.name}
        </h1>
        <p className="mt-1.5 text-sm text-[#5d6678]">{competenceLabel}</p>
        <div className="mt-3 h-px w-10 bg-[#ebc617]" />
      </header>

      {error ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-[#5d6678]">
            Não foi possível carregar a composição deste território.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-semibold text-[#1a2130] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
      <section className="territorial-section">
        <ModuleTitle>Remuneração</ModuleTitle>
        {composition.remuneration ? (
          <>
            <div className="mt-2.5 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#727d91]">
                  Salário médio nominal
                </p>
                <p className="shrink-0 text-[1.35rem] font-semibold leading-none tabular-nums tracking-tight text-[#1a2130]">
                  {formatCurrencyBRL(composition.remuneration.mean)}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#727d91]">
                  Salário mediano nominal
                </p>
                <p className="shrink-0 text-[1.35rem] font-semibold leading-none tabular-nums tracking-tight text-[#1a2130]">
                  {formatCurrencyBRL(composition.remuneration.median)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-4 text-[#8b93a3]">
              Admissões · território inteiro · metodologia institucional
            </p>
          </>
        ) : (
          <Unavailable>Indisponível para esta competência.</Unavailable>
        )}
      </section>

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>Setores por saldo</ModuleTitle>
        {composition.sectors.length > 0 ? (
          <SaldoList items={composition.sectors} />
        ) : (
          <Unavailable>Sem setores publicados nesta competência.</Unavailable>
        )}
      </section>

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>Ocupações por saldo</ModuleTitle>
        {composition.occupations.length > 0 ? (
          <SaldoList items={composition.occupations} />
        ) : (
          <Unavailable>Sem ocupações publicadas nesta competência.</Unavailable>
        )}
      </section>

      {composition.profile.length > 0 ? (
        <section className="territorial-section border-t border-[#e4dfd4] pt-3">
          <ModuleTitle>Perfil por saldo</ModuleTitle>
          <ul className="territorial-profile-list mt-2.5 space-y-2">
            {composition.profile.map((item) => (
              <li key={item.dimension} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#727d91]">
                  {item.dimension}
                </p>
                <p className="min-w-0 truncate text-sm font-medium text-[#1a2130]" title={item.label}>
                  {item.label}
                </p>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-[#1a2130]">
                  {formatSignedInt(item.saldo)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
        </>
      )}

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>{rankTitle}</ModuleTitle>
        {rankingLoading ? (
          <p className="mt-2 text-sm text-[#8b93a3]">Carregando ranking</p>
        ) : rankingError ? (
          <Unavailable>Ranking indisponível.</Unavailable>
        ) : ranking.length > 0 ? (
          <SaldoList items={ranking} />
        ) : (
          <Unavailable>Sem unidades com saldo publicado.</Unavailable>
        )}
      </section>
    </div>
  )
}
