import { useEffect, useMemo, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchTable } from '../api/gold'
import type { TableResponse } from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { CompetenciaDeltaBar } from '../components/charts/CompetenciaDeltaBar'
import { MovementSplit } from '../components/charts/MovementSplit'
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

export function SectorPage() {
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
    fetchTable(GOLD_TABLES.SETOR, scope, ano, mes, {
      limit: 500,
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
    fetchTable(GOLD_TABLES.SETOR, scope, previousCompetencia.ano, previousCompetencia.mes, {
      limit: 500,
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
    if (tbl && !selectionExists(selected, tbl.rows, GOLD_COLUMNS.SECAO)) {
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
      GOLD_COLUMNS.SECAO,
    )
  }, [comparisonCurrentRows, comparisonPreviousRows])
  const compareReady = comparison !== null

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }
  if (showInitialLoader || !tbl) {
    return <LoadingState label="Carregando dados de setores..." />
  }

  const visibleSelection = selectionExists(selected, tbl.rows, GOLD_COLUMNS.SECAO)
    ? selected
    : null
  const rowsForRank = visibleSelection
    ? tbl.rows.filter(
        (r) =>
          String((r as Record<string, unknown>)[GOLD_COLUMNS.SECAO] ?? '') ===
          visibleSelection,
      )
    : tbl.rows
  const top = rowsForRank.slice(0, 12)
  const treemapNodes: SignedTreemapNode[] = tbl.rows
    .map((r) => {
      const name = String((r as Record<string, unknown>)[GOLD_COLUMNS.SECAO] ?? '—')
      const signed = Number((r as Record<string, unknown>)[GOLD_COLUMNS.SALDO] ?? 0)
      const value = Math.abs(signed)
      return { name, value, signedValue: signed }
    })
    .filter((n) => Number.isFinite(n.value) && n.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 30)

  return (
    <div className={['space-y-8', shellClass].filter(Boolean).join(' ')}>
      <PageHeader
        eyebrow="Setores"
        title={`Seção · ${labelScope(scope)}`}
        subtitle={`${tbl.total} linhas · competência ${label}`}
      />

      <ChartCard
        title="Composição do saldo por setor"
        subtitle="Distribuição do saldo de empregos entre os principais setores"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Saldos por setor"
          subtitle="Ranking de setores por saldo líquido de emprego no mês selecionado."
          action={
            <TableToggleButton open={tableOpen} onToggle={() => setTableOpen((v) => !v)} />
          }
        >
          <BarRank
            rows={top}
            labelKey={GOLD_COLUMNS.SECAO}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.sector.primary}
            highlightTop1
          />
          <ChartTablePanel open={tableOpen}>
            <DataGrid columns={tbl.columns} rows={tbl.rows} maxHeightClass="max-h-[480px]" />
          </ChartTablePanel>
        </ChartCard>
        <ChartCard
          title="Composição adm / desl"
          subtitle="Leitura rápida do balanço: admissões vs desligamentos por setor."
        >
          <MovementSplit rows={top.slice(0, 10)} labelKey={GOLD_COLUMNS.SECAO} />
        </ChartCard>
      </div>

      <ChartCard
        title={
          comparePeriodTitle
            ? `Variação do saldo por setor (${comparePeriodTitle})`
            : 'Variação do saldo por setor'
        }
        subtitle="Setores com maior alta e maior retração entre a competência anterior e a selecionada"
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
