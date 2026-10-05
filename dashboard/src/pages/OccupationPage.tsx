import { useEffect, useMemo, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchTable } from '../api/gold'
import type { TableResponse } from '../api/types'
import { BarRankHorizontalLabels } from '../components/charts/BarRank'
import { CompetenciaDeltaBar } from '../components/charts/CompetenciaDeltaBar'
import { SignedTreemap, type SignedTreemapNode } from '../components/charts/SignedTreemap'
import { DataGrid } from '../components/table/DataGrid'
import { ChartCard } from '../components/ui/ChartCard'
import { ChartTablePanel, TableToggleButton } from '../components/ui/ChartTableToggle'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { labelScope, shortCompetenciaLabel } from '../lib/format'
import { chartTheme } from '../lib/chartTheme'
import { buildPeriodDeltaData } from '../lib/periodDelta'
import {
  buildRequestContextKey,
  comparisonPayloadsForContext,
  responseMatchesRequest,
  selectionExists,
} from '../lib/requestContext'
import { useContextPayload } from '../lib/useContextPayload'
import { useScopeStableLoading } from '../lib/useScopeStableLoading'
import { scheduleAsyncState } from '../lib/scheduleAsyncState'

const palette = chartTheme.palette

export function OccupationPage() {
  const { scope } = useScope()
  const { ano, mes, label, previousCompetencia } = useMonth()
  const requestKey = buildRequestContextKey(scope, ano, mes)
  const previousRequestKey = previousCompetencia
    ? buildRequestContextKey(scope, previousCompetencia.ano, previousCompetencia.mes)
    : null
  const { data: tbl, payload: tablePayload, commit: commitTable } =
    useContextPayload<TableResponse>(requestKey)
  const { payload: previousTablePayload, commit: commitPrevious } =
    useContextPayload<TableResponse>(previousRequestKey ?? requestKey)
  const [selected, setSelected] = useState<string | null>(null)
  const {
    data: err,
    commit: commitError,
    clear: clearError,
  } = useContextPayload<string>(requestKey)
  const {
    data: compareErr,
    commit: commitCompareError,
    clear: clearCompareError,
  } = useContextPayload<string>(previousRequestKey ?? requestKey)
  const [compareLoading, setCompareLoading] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const { beginFetch, endFetch, shellClass, showInitialLoader } = useScopeStableLoading(tbl)

  const comparePeriodTitle = previousCompetencia
    ? `${shortCompetenciaLabel(previousCompetencia.mes, previousCompetencia.ano)} → ${shortCompetenciaLabel(mes, ano)}`
    : null

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled
    const capturedKey = requestKey
    beginFetch(isCancelled, () => {
      clearError(capturedKey)
    })
    fetchTable(GOLD_TABLES.OCUPACAO, scope, ano, mes, {
      limit: 2000,
      sort_by: GOLD_COLUMNS.SALDO,
      sort_dir: 'desc',
    })
      .then((d) => {
        if (!cancelled && responseMatchesRequest(d, capturedKey)) {
          commitTable(capturedKey, d)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          commitError(capturedKey, e instanceof Error ? e.message : 'Erro')
        }
      })
      .finally(() => {
        if (!cancelled) endFetch()
      })
    return () => {
      cancelled = true
    }
  }, [
    scope,
    ano,
    mes,
    requestKey,
    retryKey,
    beginFetch,
    endFetch,
    clearError,
    commitError,
    commitTable,
  ])

  useEffect(() => {
    if (!previousCompetencia || !previousRequestKey) {
      let cancelled = false
      const isCancelled = () => cancelled
      scheduleAsyncState(isCancelled, () => {
        setCompareLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    const isCancelled = () => cancelled
    const capturedKey = previousRequestKey
    scheduleAsyncState(isCancelled, () => {
      setCompareLoading(true)
      clearCompareError(capturedKey)
    })
    fetchTable(GOLD_TABLES.OCUPACAO, scope, previousCompetencia.ano, previousCompetencia.mes, {
      limit: 2000,
      sort_by: GOLD_COLUMNS.SALDO,
      sort_dir: 'desc',
    })
      .then((d) => {
        if (!cancelled && responseMatchesRequest(d, capturedKey)) {
          commitPrevious(capturedKey, d)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          commitCompareError(capturedKey, e instanceof Error ? e.message : 'Erro')
        }
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    scope,
    previousCompetencia,
    previousRequestKey,
    retryKey,
    clearCompareError,
    commitCompareError,
    commitPrevious,
  ])

  useEffect(() => {
    let cancelled = false
    if (tbl && !selectionExists(selected, tbl.rows, GOLD_COLUMNS.CBO_OCUPACAO)) {
      scheduleAsyncState(() => cancelled, () => setSelected(null))
    }
    return () => {
      cancelled = true
    }
  }, [selected, tbl])

  const comparison = useMemo(
    () =>
      comparisonPayloadsForContext(
        tablePayload,
        requestKey,
        previousTablePayload,
        previousRequestKey,
      ),
    [previousRequestKey, previousTablePayload, requestKey, tablePayload],
  )
  const comparisonPreviousRows = comparison?.previous.rows
  const comparisonCurrentRows = comparison?.current.rows
  const compareData = useMemo(() => {
    if (!comparisonPreviousRows || !comparisonCurrentRows) return []
    return buildPeriodDeltaData(
      comparisonPreviousRows,
      comparisonCurrentRows,
      GOLD_COLUMNS.CBO_OCUPACAO,
    )
  }, [comparisonCurrentRows, comparisonPreviousRows])
  const compareReady = comparison !== null

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }
  if (showInitialLoader || !tbl) {
    return <LoadingState label="Carregando dados de ocupações..." />
  }

  const visibleSelection = selectionExists(
    selected,
    tbl.rows,
    GOLD_COLUMNS.CBO_OCUPACAO,
  )
    ? selected
    : null
  const rowsForChart = visibleSelection
    ? tbl.rows.filter(
        (r) =>
          String((r as Record<string, unknown>)[GOLD_COLUMNS.CBO_OCUPACAO] ?? '') ===
          visibleSelection,
      )
    : tbl.rows
  const chartRows = rowsForChart.slice(0, 12)
  const treemapNodes: SignedTreemapNode[] = tbl.rows
    .map((r) => {
      const name = String((r as Record<string, unknown>)[GOLD_COLUMNS.CBO_OCUPACAO] ?? '—')
      const signed = Number((r as Record<string, unknown>)[GOLD_COLUMNS.SALDO] ?? 0)
      const value = Math.abs(signed)
      return { name, value, signedValue: signed }
    })
    .filter((n) => Number.isFinite(n.value) && n.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 40)

  return (
    <div className={['space-y-8', shellClass].filter(Boolean).join(' ')}>
      <PageHeader
        eyebrow="Ocupações"
        title={`CBO (ocupação) · ${labelScope(scope)}`}
        subtitle={`${tbl.total.toLocaleString('pt-BR')} ocupações · competência ${label} · até 2.000 linhas ordenadas por saldo.`}
      />

      <ChartCard
        title="Composição do saldo por ocupação"
        subtitle="Distribuição do saldo de empregos entre as principais ocupações"
        action={
          visibleSelection ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
            >
              limpar filtro
            </button>
          ) : null
        }
      >
        {visibleSelection ? (
          <p className="mb-2 text-xs text-slate-400">Filtro ativo: {visibleSelection}</p>
        ) : null}
        <SignedTreemap
          nodes={treemapNodes}
          selectedName={visibleSelection}
          onSelect={(name) => setSelected((cur) => (cur === name ? null : name))}
        />
      </ChartCard>

      <ChartCard
        title="Destaques em saldo"
        subtitle="Top 12 ocupações por saldo líquido de emprego no recorte selecionado."
        action={
          <TableToggleButton open={tableOpen} onToggle={() => setTableOpen((v) => !v)} />
        }
      >
        <BarRankHorizontalLabels
          rows={chartRows}
          labelKey={GOLD_COLUMNS.CBO_OCUPACAO}
          valueKey={GOLD_COLUMNS.SALDO}
          color={palette.occupation.primary}
        />
        <ChartTablePanel open={tableOpen}>
          <DataGrid columns={tbl.columns} rows={tbl.rows} maxHeightClass="max-h-[600px]" />
        </ChartTablePanel>
      </ChartCard>

      <ChartCard
        title={
          comparePeriodTitle
            ? `Variação do saldo por ocupação (${comparePeriodTitle})`
            : 'Variação do saldo por ocupação'
        }
        subtitle="Ocupações com maior avanço e maior queda entre a competência anterior e a selecionada"
        hover={false}
      >
        {!previousCompetencia ? (
          <EmptyState
            title="Comparativo indisponível"
            description="Não há competência anterior disponível para comparar com a competência selecionada."
          />
        ) : null}
        {previousCompetencia && compareErr ? (
          <p className="text-sm text-slate-400">Comparativo indisponível: {compareErr}</p>
        ) : null}
        {previousCompetencia && !compareErr && (compareLoading || !compareReady) ? (
          <LoadingState
            variant="solid"
            fillHeight={false}
            className="min-h-40 py-8"
            label="Atualizando comparativo..."
          />
        ) : null}
        {previousCompetencia && !compareErr && !compareLoading && compareReady ? (
          compareData.length ? (
            <CompetenciaDeltaBar
              data={compareData}
              previousLabel={previousCompetencia.label}
              currentLabel={label}
            />
          ) : (
            <EmptyState
              description="Sem dados suficientes para comparar as competências neste recorte."
            />
          )
        ) : null}
      </ChartCard>
    </div>
  )
}
