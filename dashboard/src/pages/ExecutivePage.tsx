import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { fetchOverview } from '../api/gold'
import type { GoldRow, OverviewResponse, Scope } from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { MovementSplit } from '../components/charts/MovementSplit'
import { ChartCard } from '../components/ui/ChartCard'
import { CompareChip } from '../components/ui/CompareChip'
import { ErrorState } from '../components/ui/ErrorState'
import { KpiStat } from '../components/ui/KpiStat'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionTitle } from '../components/ui/SectionTitle'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { chartTheme } from '../lib/chartTheme'
import { formatCompact, labelScope } from '../lib/format'
import { useScopeStableLoading } from '../lib/useScopeStableLoading'
import { theme } from '../lib/theme'

const palette = chartTheme.palette

const COMPARE_SCOPES: Scope[] = ['br', 'pr', 'rmc']

type OverviewCache = Map<string, Promise<OverviewResponse>>

type CompareBundle = {
  key: string
  data: Partial<Record<Scope, GoldRow | null>>
}

function overviewCacheKey(scope: Scope, ano: number, mes: number): string {
  return `${scope}:${ano}:${mes}`
}

function compareMonthKey(ano: number, mes: number): string {
  return `${ano}-${mes}`
}

/** Reutiliza a mesma Promise para (scope, ano, mes) dentro do ciclo da página. */
function fetchOverviewCached(
  cache: OverviewCache,
  scope: Scope,
  ano: number,
  mes: number,
): Promise<OverviewResponse> {
  const key = overviewCacheKey(scope, ano, mes)
  const existing = cache.get(key)
  if (existing) return existing
  const request = fetchOverview(scope, ano, mes).catch((err: unknown) => {
    cache.delete(key)
    throw err
  })
  cache.set(key, request)
  return request
}

type ExecutiveKpiDisplay = {
  resumo: GoldRow | null
  prevResumo: GoldRow | null
  previousLabel: string | null
}

function territoryLink(search: string) {
  return search ? `/territorio?${search}` : '/territorio'
}

export function ExecutivePage() {
  const { scope } = useScope()
  const { ano, mes, label, previousCompetencia } = useMonth()
  const [searchParams] = useSearchParams()
  const search = searchParams.toString()
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [kpiDisplay, setKpiDisplay] = useState<ExecutiveKpiDisplay | null>(null)
  const [compareBundle, setCompareBundle] = useState<CompareBundle | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const overviewCacheRef = useRef<OverviewCache>(new Map())
  const { beginFetch, endFetch, shellClass, showInitialLoader } = useScopeStableLoading(data)

  const monthKey = compareMonthKey(ano, mes)
  const compareReady = compareBundle?.key === monthKey
  const compare = compareReady ? compareBundle.data : {}

  useEffect(() => {
    overviewCacheRef.current.clear()
  }, [ano, mes, retryKey])

  useEffect(() => {
    let cancel = false
    const isCancelled = () => cancel
    beginFetch(isCancelled, () => {
      setErr(null)
    })
    const prev = previousCompetencia
    const cache = overviewCacheRef.current
    const reqs: Promise<OverviewResponse>[] = [
      fetchOverviewCached(cache, scope, ano, mes),
      ...(prev ? [fetchOverviewCached(cache, scope, prev.ano, prev.mes)] : []),
    ]
    Promise.all(reqs)
      .then(([current, prevData]) => {
        if (cancel) return
        const newPrevResumo = prev ? (prevData?.resumo ?? null) : null
        setData(current)
        setKpiDisplay({
          resumo: current.resumo,
          prevResumo: newPrevResumo,
          previousLabel: prev?.label ?? null,
        })
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : 'Falha ao carregar')
      })
      .finally(() => {
        if (!cancel) endFetch()
      })
    return () => {
      cancel = true
    }
  }, [scope, ano, mes, previousCompetencia, retryKey, beginFetch, endFetch])

  useEffect(() => {
    let cancel = false
    const cache = overviewCacheRef.current
    const key = monthKey
    Promise.all(COMPARE_SCOPES.map((s) => fetchOverviewCached(cache, s, ano, mes)))
      .then((rows) => {
        if (cancel) return
        const next: Partial<Record<Scope, GoldRow | null>> = {}
        rows.forEach((r, i) => {
          next[COMPARE_SCOPES[i]] = r.resumo
        })
        setCompareBundle({ key, data: next })
      })
      .catch(() => {
        if (!cancel) setCompareBundle({ key, data: {} })
      })
    return () => {
      cancel = true
    }
  }, [ano, mes, monthKey, retryKey])

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }

  if (showInitialLoader || !data || !kpiDisplay) {
    return <LoadingState label="Carregando visão executiva..." />
  }

  const kpiPreviousLabel = kpiDisplay.previousLabel ?? undefined
  const kpiHasCompare = kpiDisplay.previousLabel !== null

  return (
    <div className={[theme.executive.pageStack, shellClass].filter(Boolean).join(' ')}>
      <div className={theme.executive.heroSection}>
        <p className={theme.executive.heroEyebrow}>Visão executiva</p>
        <h1 className={theme.executive.heroTitle}>Movimentação de emprego formal</h1>
        <p className={theme.executive.heroSubtitle}>
          Recorte atual: <span className="font-medium text-[color:var(--ds-text-primary)]">{labelScope(scope)}</span>
          {' · '}
          competência {label}
        </p>
      </div>

      <div className={theme.executive.kpiGrid}>
        <KpiStat
          variant="executive"
          executiveAccent="blue"
          label="Admissões"
          value={kpiDisplay.resumo?.[GOLD_COLUMNS.ADMISSOES]}
          prevValue={kpiHasCompare ? kpiDisplay.prevResumo?.[GOLD_COLUMNS.ADMISSOES] : undefined}
          previousLabel={kpiPreviousLabel}
        />
        <KpiStat
          variant="executive"
          executiveAccent="purple"
          label="Desligamentos"
          value={kpiDisplay.resumo?.[GOLD_COLUMNS.DESLIGAMENTOS]}
          prevValue={kpiHasCompare ? kpiDisplay.prevResumo?.[GOLD_COLUMNS.DESLIGAMENTOS] : undefined}
          previousLabel={kpiPreviousLabel}
        />
        <KpiStat
          variant="executive"
          executiveAccent="green"
          label="Saldo"
          value={kpiDisplay.resumo?.[GOLD_COLUMNS.SALDO]}
          prevValue={kpiHasCompare ? kpiDisplay.prevResumo?.[GOLD_COLUMNS.SALDO] : undefined}
          previousLabel={kpiPreviousLabel}
          valueToneFromDelta
        />
      </div>

      <div className={theme.executive.compareSection}>
        <SectionTitle
          title="Comparativo rápido de escopos"
          subtitle="Visão lado a lado do saldo líquido, admissões e desligamentos no mês selecionado."
        />
        <div className={theme.executive.compareGrid}>
          {!compareReady ? (
            <div
              className="col-span-full flex min-h-[5.75rem] items-center justify-center"
              aria-busy="true"
              aria-label="Carregando comparativo de escopos"
            >
              <div className={theme.loadingState.spinnerClass} aria-hidden />
            </div>
          ) : (
            COMPARE_SCOPES.map((s) => {
                const scopeResumo = compare[s] ?? null
                return (
                  <CompareChip
                    key={s}
                    variant="executive"
                    scopeKey={s}
                    label={labelScope(s)}
                    active={scope === s}
                    value={
                      <>
                        {formatCompact(scopeResumo?.[GOLD_COLUMNS.SALDO])}
                        <span className="ml-1 text-xs font-normal text-[color:var(--ds-text-muted)]">saldo</span>
                      </>
                    }
                    detail={
                      <>
                        adm {formatCompact(scopeResumo?.[GOLD_COLUMNS.ADMISSOES])} · desl{' '}
                        {formatCompact(scopeResumo?.[GOLD_COLUMNS.DESLIGAMENTOS])}
                      </>
                    }
                  />
                )
            })
          )}
        </div>
      </div>

      <div className={theme.executive.chartSection}>
        <div className={theme.executive.chartGrid}>
        <ChartCard
          surface="executive"
          className={theme.executive.chartHoverClass}
          title="UF — maiores saldos"
          subtitle={
            scope === 'br'
              ? 'Ranking por saldo líquido de emprego no mês selecionado.'
              : 'Indisponível fora do escopo Brasil'
          }
          action={
            scope === 'br' ? (
              <Link to={territoryLink(search)} className={theme.chartCard.actionClass}>
                Ver todas
              </Link>
            ) : undefined
          }
        >
          {data.rankings.uf?.length ? (
            <BarRank
              rows={data.rankings.uf}
              labelKey={GOLD_COLUMNS.UF}
              valueKey={GOLD_COLUMNS.SALDO}
              color={palette.territory.primary}
              highlightTop1
            />
          ) : (
            <p className="text-sm text-[color:var(--ds-text-muted)]">Selecione o escopo Brasil para ver o ranking por UF.</p>
          )}
        </ChartCard>

        <ChartCard
          surface="executive"
          className={theme.executive.chartHoverClass}
          title="Municípios — top saldos"
          subtitle="Ranking por saldo líquido de emprego no recorte selecionado."
          action={
            <Link to={territoryLink(search)} className={theme.chartCard.actionClass}>
              Ver todos
            </Link>
          }
        >
          <BarRank
            rows={data.rankings.municipio}
            labelKey={GOLD_COLUMNS.MUNICIPIO}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.territory.municipio}
            yAxisInterval={0}
            highlightTop1
          />
        </ChartCard>
        </div>
      </div>

      <div className={theme.executive.chartSection}>
        <div className={theme.executive.chartGrid}>
        <ChartCard
          surface="executive"
          className={theme.executive.chartHoverClass}
          title="Setores — composição da movimentação"
          subtitle="Comparação entre admissões e desligamentos por setor no mês selecionado."
        >
          <MovementSplit rows={data.rankings.setor.slice(0, 10)} labelKey={GOLD_COLUMNS.SECAO} />
        </ChartCard>

        <ChartCard
          surface="executive"
          className={theme.executive.chartHoverClass}
          title="Ocupações — liderança em saldo"
          subtitle="Ocupações com maior saldo líquido de emprego no período selecionado."
        >
          <BarRank
            rows={data.rankings.ocupacao}
            labelKey={GOLD_COLUMNS.CBO_OCUPACAO}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.occupation.primary}
            highlightTop1
          />
        </ChartCard>
        </div>
      </div>
    </div>
  )
}
