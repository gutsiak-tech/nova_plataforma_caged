import { useCallback, useEffect, useRef, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchOverview, fetchTable } from '../api/gold'
import type { OverviewResponse, Scope, TableResponse } from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { CategoricalHeatmap } from '../components/charts/CategoricalHeatmap'
import { DataGrid } from '../components/table/DataGrid'
import { ChartCard } from '../components/ui/ChartCard'
import { ChartTablePanel, TableToggleButton } from '../components/ui/ChartTableToggle'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { chartTheme } from '../lib/chartTheme'
import { formatCurrencyBRL, labelScope } from '../lib/format'
import { buildRequestContextKey, responseMatchesRequest } from '../lib/requestContext'
import { getTerritorialSalaryMedian } from '../lib/salarySummary'
import { theme } from '../lib/theme'
import { useContextPayload } from '../lib/useContextPayload'
import { useScopeStableLoading } from '../lib/useScopeStableLoading'

const palette = chartTheme.palette

type OverviewCache = Map<string, Promise<OverviewResponse>>
type TableCache = Map<string, Promise<TableResponse>>
type OptionalTableSlot = 'sexo' | 'faixa' | 'instrucao'
type HeatmapTableSlot = 'sx_fx' | 'sx_ins' | 'fx_ins'
type SalaryPayload = {
  overview: OverviewResponse
  tables: Record<string, TableResponse | null>
}

const TABLE_SORT = { sort_by: GOLD_COLUMNS.SALDO } as const

const OPTIONAL_TABLE_CONFIG: Record<
  OptionalTableSlot,
  { base: (typeof GOLD_TABLES)[keyof typeof GOLD_TABLES]; limit: number }
> = {
  sexo: { base: GOLD_TABLES.PERFIL_SEXO_SALARIO, limit: 50 },
  faixa: { base: GOLD_TABLES.PERFIL_FAIXA_ETARIA_SALARIO, limit: 80 },
  instrucao: { base: GOLD_TABLES.PERFIL_GRAUDEINSTRUCAO_SALARIO, limit: 80 },
}

const HEATMAP_TABLE_CONFIG: Record<
  HeatmapTableSlot,
  { base: (typeof GOLD_TABLES)[keyof typeof GOLD_TABLES] }
> = {
  sx_fx: { base: GOLD_TABLES.PERFIL_SEXO_FAIXA_ETARIA_SALARIO },
  sx_ins: { base: GOLD_TABLES.PERFIL_SEXO_INSTRUCAO_SALARIO },
  fx_ins: { base: GOLD_TABLES.PERFIL_FAIXA_ETARIA_INSTRUCAO_SALARIO },
}

const HEATMAP_LIMIT = 200

function overviewCacheKey(scope: Scope, ano: number, mes: number): string {
  return `${scope}:${ano}:${mes}`
}

function tableCacheKey(
  baseName: string,
  scope: Scope,
  ano: number,
  mes: number,
  opts?: { limit?: number; sort_by?: string },
): string {
  return `${baseName}:${scope}:${ano}:${mes}:${opts?.limit ?? ''}:${opts?.sort_by ?? ''}`
}

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

function fetchTableCached(
  cache: TableCache,
  baseName: string,
  scope: Scope,
  ano: number,
  mes: number,
  opts?: { limit?: number; sort_by?: string },
): Promise<TableResponse> {
  const key = tableCacheKey(baseName, scope, ano, mes, opts)
  const existing = cache.get(key)
  if (existing) return existing
  const request = fetchTable(baseName, scope, ano, mes, opts).catch((err: unknown) => {
    cache.delete(key)
    throw err
  })
  cache.set(key, request)
  return request
}

export function SalaryPage() {
  const { scope } = useScope()
  const { ano, mes, label } = useMonth()
  const requestKey = buildRequestContextKey(scope, ano, mes)
  const {
    data: payload,
    commit: commitPayload,
    update: updatePayload,
  } = useContextPayload<SalaryPayload>(requestKey)
  const ov = payload?.overview ?? null
  const tables = payload?.tables ?? {}
  const {
    data: err,
    commit: commitError,
    clear: clearError,
  } = useContextPayload<string>(requestKey)
  const [retryKey, setRetryKey] = useState(0)
  const { beginFetch, endFetch, shellClass, showInitialLoader } = useScopeStableLoading(ov)
  const [tableOpen, setTableOpen] = useState({
    sexo: false,
    faixa: false,
    instrucao: false,
    sx_fx: false,
    sx_ins: false,
    fx_ins: false,
  })
  const overviewCacheRef = useRef<OverviewCache>(new Map())
  const tableCacheRef = useRef<TableCache>(new Map())

  useEffect(() => {
    overviewCacheRef.current.clear()
    tableCacheRef.current.clear()
  }, [scope, ano, mes, retryKey])

  const loadOptionalTable = useCallback(
    (slot: OptionalTableSlot) => {
      const capturedKey = requestKey
      const cfg = OPTIONAL_TABLE_CONFIG[slot]
      fetchTableCached(tableCacheRef.current, cfg.base, scope, ano, mes, {
        limit: cfg.limit,
        ...TABLE_SORT,
      })
        .then((data) => {
          if (!responseMatchesRequest(data, capturedKey)) return
          updatePayload(capturedKey, (current) => ({
            ...current,
            tables: { ...current.tables, [slot]: data },
          }))
        })
        .catch(() => {
          // Tabela opcional do painel — falha não derruba a página.
        })
    },
    [scope, ano, mes, requestKey, updatePayload],
  )

  const toggleOptionalTable = useCallback(
    (slot: OptionalTableSlot) => {
      setTableOpen((s) => {
        const next = !s[slot]
        if (next) loadOptionalTable(slot)
        return { ...s, [slot]: next }
      })
    },
    [loadOptionalTable],
  )

  useEffect(() => {
    let c = false
    const isCancelled = () => c
    const capturedKey = requestKey
    beginFetch(isCancelled, () => {
      clearError(capturedKey)
    })
    const heatmapOpts = { limit: HEATMAP_LIMIT, ...TABLE_SORT }
    Promise.all([
      fetchOverviewCached(overviewCacheRef.current, scope, ano, mes),
      fetchTableCached(
        tableCacheRef.current,
        HEATMAP_TABLE_CONFIG.sx_fx.base,
        scope,
        ano,
        mes,
        heatmapOpts,
      ),
      fetchTableCached(
        tableCacheRef.current,
        HEATMAP_TABLE_CONFIG.sx_ins.base,
        scope,
        ano,
        mes,
        heatmapOpts,
      ),
      fetchTableCached(
        tableCacheRef.current,
        HEATMAP_TABLE_CONFIG.fx_ins.base,
        scope,
        ano,
        mes,
        heatmapOpts,
      ),
    ])
      .then(([o, sxFx, sxIns, fxIns]) => {
        if (c) return
        if (
          ![o, sxFx, sxIns, fxIns].every((response) =>
            responseMatchesRequest(response, capturedKey),
          )
        ) {
          return
        }
        commitPayload(capturedKey, {
          overview: o,
          tables: {
            sx_fx: sxFx,
            sx_ins: sxIns,
            fx_ins: fxIns,
          },
        })
      })
      .catch((e: unknown) => {
        if (!c) commitError(capturedKey, e instanceof Error ? e.message : 'Erro')
      })
      .finally(() => {
        if (!c) endFetch()
      })
    return () => {
      c = true
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
    commitPayload,
  ])

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }
  if (showInitialLoader || !ov) {
    return <LoadingState label="Carregando indicadores de salário..." />
  }

  const territorialMedian = getTerritorialSalaryMedian(ov)

  return (
    <div className={['space-y-10', shellClass].filter(Boolean).join(' ')}>
      <PageHeader
        eyebrow="Salários"
        title={`Remuneração · ${labelScope(scope)}`}
        subtitle={`Competência ${label}. Estatísticas derivadas da camada Gold (média, mediana, quartis). Valores extremos podem distorcer médias — use mediana e quartis para leitura robusta.`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={theme.kpiTile.baseClass}>
          <p className={theme.kpiTile.labelClass}>Mediana salarial</p>
          <p
            className={[theme.kpiTile.valueClass, theme.kpiTile.toneNeutral].join(' ')}
            aria-label={`Mediana salarial: ${formatCurrencyBRL(territorialMedian)}`}
          >
            {formatCurrencyBRL(territorialMedian)}
          </p>
          <p className={theme.kpiTile.hintClass}>Mediana salarial no recorte selecionado.</p>
        </div>
        <div className="lg:col-span-2">
          <ChartCard
            title="Saldo vs salário médio (sexo)"
            subtitle="Comparação por sexo usando salário médio (referência do mês selecionado)."
            hover={false}
            action={
              <TableToggleButton open={tableOpen.sexo} onToggle={() => toggleOptionalTable('sexo')} />
            }
          >
            <BarRank
              rows={ov.salary_profiles[GOLD_COLUMNS.SEXO]}
              labelKey={GOLD_COLUMNS.SEXO}
              valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
              color={palette.salary.primary}
              highlightTop1
            />
            {tableOpen.sexo ? (
              <ChartTablePanel open={tableOpen.sexo}>
                {tables.sexo ? (
                  <DataGrid columns={tables.sexo.columns} rows={tables.sexo.rows} />
                ) : null}
              </ChartTablePanel>
            ) : null}
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Faixa etária — salário médio"
          subtitle="Ranking por faixa etária usando salário médio (mês selecionado)."
          hover={false}
          action={
            <TableToggleButton open={tableOpen.faixa} onToggle={() => toggleOptionalTable('faixa')} />
          }
        >
          <BarRank
            rows={ov.salary_profiles[GOLD_COLUMNS.FAIXA_ETARIA]}
            labelKey={GOLD_COLUMNS.FAIXA_ETARIA}
            valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
            color={palette.salary.secondary}
            highlightTop1
          />
          {tableOpen.faixa ? (
            <ChartTablePanel open={tableOpen.faixa}>
              {tables.faixa ? (
                <DataGrid
                  columns={tables.faixa.columns}
                  rows={tables.faixa.rows}
                  maxHeightClass="max-h-[480px]"
                />
              ) : null}
            </ChartTablePanel>
          ) : null}
        </ChartCard>
        <ChartCard
          title="Instrução — salário médio"
          subtitle="Ranking por escolaridade usando salário médio (mês selecionado)."
          hover={false}
          action={
            <TableToggleButton
              open={tableOpen.instrucao}
              onToggle={() => toggleOptionalTable('instrucao')}
            />
          }
        >
          <BarRank
            rows={ov.salary_profiles[GOLD_COLUMNS.GRAUDEINSTRUCAO]}
            labelKey={GOLD_COLUMNS.GRAUDEINSTRUCAO}
            valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
            color={palette.salary.average}
            highlightTop1
          />
          {tableOpen.instrucao ? (
            <ChartTablePanel open={tableOpen.instrucao}>
              {tables.instrucao ? (
                <DataGrid
                  columns={tables.instrucao.columns}
                  rows={tables.instrucao.rows}
                  maxHeightClass="max-h-[480px]"
                />
              ) : null}
            </ChartTablePanel>
          ) : null}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {tables.sx_fx ? (
          <ChartCard
            title="Sexo × faixa etária"
            subtitle="Intensidade por salário médio em cada combinação."
            hover={false}
            action={
              <TableToggleButton
                open={tableOpen.sx_fx}
                onToggle={() => setTableOpen((s) => ({ ...s, sx_fx: !s.sx_fx }))}
              />
            }
          >
            <CategoricalHeatmap
              rows={tables.sx_fx.rows}
              rowKey={GOLD_COLUMNS.SEXO}
              colKey={GOLD_COLUMNS.FAIXA_ETARIA}
              rowAxisLabel="Sexo"
              colAxisLabel="Faixa etária"
            />
            <ChartTablePanel open={tableOpen.sx_fx}>
              <DataGrid
                columns={tables.sx_fx.columns}
                rows={tables.sx_fx.rows}
                maxHeightClass="max-h-[480px]"
              />
            </ChartTablePanel>
          </ChartCard>
        ) : null}

        {tables.sx_ins ? (
          <ChartCard
            title="Sexo × instrução"
            subtitle="Intensidade por salário médio em cada combinação."
            hover={false}
            action={
              <TableToggleButton
                open={tableOpen.sx_ins}
                onToggle={() => setTableOpen((s) => ({ ...s, sx_ins: !s.sx_ins }))}
              />
            }
          >
            <CategoricalHeatmap
              rows={tables.sx_ins.rows}
              rowKey={GOLD_COLUMNS.SEXO}
              colKey={GOLD_COLUMNS.GRAUDEINSTRUCAO}
              rowAxisLabel="Sexo"
              colAxisLabel="Instrução"
              wide
            />
            <ChartTablePanel open={tableOpen.sx_ins}>
              <DataGrid
                columns={tables.sx_ins.columns}
                rows={tables.sx_ins.rows}
                maxHeightClass="max-h-[480px]"
              />
            </ChartTablePanel>
          </ChartCard>
        ) : null}
      </div>

      {tables.fx_ins ? (
        <ChartCard
          title="Faixa etária × instrução"
          subtitle="Matriz ampla — intensidade por salário médio em cada combinação."
          hover={false}
          action={
            <TableToggleButton
              open={tableOpen.fx_ins}
              onToggle={() => setTableOpen((s) => ({ ...s, fx_ins: !s.fx_ins }))}
            />
          }
        >
          <CategoricalHeatmap
            rows={tables.fx_ins.rows}
            rowKey={GOLD_COLUMNS.FAIXA_ETARIA}
            colKey={GOLD_COLUMNS.GRAUDEINSTRUCAO}
            rowAxisLabel="Faixa etária"
            colAxisLabel="Instrução"
            wide
          />
          <ChartTablePanel open={tableOpen.fx_ins}>
            <DataGrid
              columns={tables.fx_ins.columns}
              rows={tables.fx_ins.rows}
              maxHeightClass="max-h-[480px]"
            />
          </ChartTablePanel>
        </ChartCard>
      ) : null}
    </div>
  )
}
