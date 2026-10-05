import { useCallback, useEffect, useRef, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchOverview, fetchTable } from '../api/gold'
import type {
  OverviewResponse,
  SalaryMovement,
  Scope,
  TableResponse,
} from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { CategoricalHeatmap } from '../components/charts/CategoricalHeatmap'
import { DataGrid } from '../components/table/DataGrid'
import { ChartCard } from '../components/ui/ChartCard'
import { ChartTablePanel, TableToggleButton } from '../components/ui/ChartTableToggle'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { chartTheme } from '../lib/chartTheme'
import { formatCurrencyBRL, formatInt, labelScope } from '../lib/format'
import { buildRequestContextKey, responseMatchesRequest } from '../lib/requestContext'
import {
  DEFAULT_SALARY_MOVEMENT,
  getTerritorialSalarySummary,
  SALARY_METHODOLOGY,
  salaryColumnsForDisplay,
  salaryMovementLabel,
} from '../lib/salarySummary'
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
  opts?: { limit?: number; sort_by?: string; movimento?: SalaryMovement },
): string {
  return `${baseName}:${scope}:${ano}:${mes}:${opts?.limit ?? ''}:${opts?.sort_by ?? ''}:${opts?.movimento ?? ''}`
}

function fetchOverviewCached(
  cache: OverviewCache,
  scope: Scope,
  ano: number,
  mes: number,
  movimento: SalaryMovement,
): Promise<OverviewResponse> {
  const key = `${overviewCacheKey(scope, ano, mes)}:${movimento}`
  const existing = cache.get(key)
  if (existing) return existing
  const request = fetchOverview(scope, ano, mes, movimento).catch((err: unknown) => {
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
  opts?: { limit?: number; sort_by?: string; movimento?: SalaryMovement },
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

function SalaryMovementToggle({
  movement,
  onChange,
}: {
  movement: SalaryMovement
  onChange: (movement: SalaryMovement) => void
}) {
  const options: SalaryMovement[] = ['admissao', 'desligamento']
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <span className={theme.selector.labelClass}>Movimento</span>
      <div
        className={theme.selector.containerClass}
        role="group"
        aria-label="Selecionar movimento salarial"
      >
        {options.map((option) => {
          const active = option === movement
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={[
                theme.selector.toggleButtonBaseClass,
                active
                  ? theme.selector.toggleButtonActiveClass
                  : theme.selector.toggleButtonInactiveClass,
              ].join(' ')}
            >
              {salaryMovementLabel(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SalaryPage() {
  const { scope } = useScope()
  const { ano, mes, label } = useMonth()
  const [movement, setMovement] = useState<SalaryMovement>(DEFAULT_SALARY_MOVEMENT)
  const movementRef = useRef(movement)
  const changeMovement = useCallback((next: SalaryMovement) => {
    movementRef.current = next
    setMovement(next)
  }, [])
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
  const currentOverview = ov?.salary_summary?.movement === movement ? ov : null
  const { beginFetch, endFetch, shellClass, showInitialLoader } =
    useScopeStableLoading(currentOverview)
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
  }, [scope, ano, mes, movement, retryKey])

  const loadOptionalTable = useCallback(
    (slot: OptionalTableSlot) => {
      const capturedKey = requestKey
      const capturedMovement = movement
      const cfg = OPTIONAL_TABLE_CONFIG[slot]
      fetchTableCached(tableCacheRef.current, cfg.base, scope, ano, mes, {
        limit: cfg.limit,
        movimento: movement,
        ...TABLE_SORT,
      })
        .then((data) => {
          if (
            movementRef.current !== capturedMovement ||
            !responseMatchesRequest(data, capturedKey)
          ) {
            return
          }
          updatePayload(capturedKey, (current) => ({
            ...current,
            tables: { ...current.tables, [slot]: data },
          }))
        })
        .catch(() => {
          // Tabela opcional do painel — falha não derruba a página.
        })
    },
    [scope, ano, mes, movement, requestKey, updatePayload],
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
    const capturedMovement = movement
    beginFetch(isCancelled, () => {
      clearError(capturedKey)
    })
    const heatmapOpts = { limit: HEATMAP_LIMIT, movimento: movement, ...TABLE_SORT }
    Promise.all([
      fetchOverviewCached(overviewCacheRef.current, scope, ano, mes, movement),
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
        if (c || movementRef.current !== capturedMovement) return
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
    movement,
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
  if (showInitialLoader || !currentOverview) {
    return <LoadingState label="Carregando indicadores de salário..." />
  }

  const territorialSummary = getTerritorialSalarySummary(currentOverview, movement)
  const movementLabel = salaryMovementLabel(movement)
  const pageHeader = (
    <PageHeader
      eyebrow="Salários"
      title={`Remuneração · ${labelScope(scope)}`}
      subtitle={`Competência ${label}. ${SALARY_METHODOLOGY}`}
      action={<SalaryMovementToggle movement={movement} onChange={changeMovement} />}
    />
  )

  if (!territorialSummary) {
    return (
      <div className={['space-y-10', shellClass].filter(Boolean).join(' ')}>
        {pageHeader}
        <EmptyState
          title="Indicadores salariais institucionais indisponíveis"
          description="A competência selecionada ainda não possui Gold salarial separada por movimento. Dados legados não são reutilizados como fallback."
        />
      </div>
    )
  }

  return (
    <div className={['space-y-10', shellClass].filter(Boolean).join(' ')}>
      {pageHeader}

      <div className="grid gap-4 md:grid-cols-3">
        <div className={theme.kpiTile.baseClass}>
          <p className={theme.kpiTile.labelClass}>N elegível · {movementLabel}</p>
          <p
            className={[theme.kpiTile.valueClass, theme.kpiTile.toneNeutral].join(' ')}
            aria-label={`Vínculos elegíveis: ${formatInt(territorialSummary.n)}`}
          >
            {formatInt(territorialSummary.n)}
          </p>
          <p className={theme.kpiTile.hintClass}>População após a metodologia institucional.</p>
        </div>
        <div className={theme.kpiTile.baseClass}>
          <p className={theme.kpiTile.labelClass}>Salário médio nominal · {movementLabel}</p>
          <p
            className={[theme.kpiTile.valueClass, theme.kpiTile.toneNeutral].join(' ')}
            aria-label={`Salário médio nominal: ${formatCurrencyBRL(territorialSummary.mean)}`}
          >
            {formatCurrencyBRL(territorialSummary.mean)}
          </p>
          <p className={theme.kpiTile.hintClass}>Média nominal do recorte selecionado.</p>
        </div>
        <div className={theme.kpiTile.baseClass}>
          <p className={theme.kpiTile.labelClass}>Salário mediano nominal · {movementLabel}</p>
          <p
            className={[theme.kpiTile.valueClass, theme.kpiTile.toneNeutral].join(' ')}
            aria-label={`Salário mediano nominal: ${formatCurrencyBRL(territorialSummary.median)}`}
          >
            {formatCurrencyBRL(territorialSummary.median)}
          </p>
          <p className={theme.kpiTile.hintClass}>Mediana territorial calculada diretamente.</p>
        </div>
      </div>

      <ChartCard
        title={`Salário médio nominal por sexo · ${movementLabel}`}
        subtitle="Comparação por sexo na população salarial elegível."
        hover={false}
        action={
          <TableToggleButton open={tableOpen.sexo} onToggle={() => toggleOptionalTable('sexo')} />
        }
      >
        <BarRank
          rows={currentOverview.salary_profiles[GOLD_COLUMNS.SEXO]}
          labelKey={GOLD_COLUMNS.SEXO}
          valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
          color={palette.salary.primary}
          highlightTop1
        />
        {tableOpen.sexo ? (
          <ChartTablePanel open={tableOpen.sexo}>
            {tables.sexo ? (
              <DataGrid
                columns={salaryColumnsForDisplay(tables.sexo.columns)}
                rows={tables.sexo.rows}
              />
            ) : null}
          </ChartTablePanel>
        ) : null}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={`Faixa etária — salário médio nominal · ${movementLabel}`}
          subtitle="Ranking por faixa etária na população salarial elegível."
          hover={false}
          action={
            <TableToggleButton open={tableOpen.faixa} onToggle={() => toggleOptionalTable('faixa')} />
          }
        >
          <BarRank
            rows={currentOverview.salary_profiles[GOLD_COLUMNS.FAIXA_ETARIA]}
            labelKey={GOLD_COLUMNS.FAIXA_ETARIA}
            valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
            color={palette.salary.secondary}
            highlightTop1
          />
          {tableOpen.faixa ? (
            <ChartTablePanel open={tableOpen.faixa}>
              {tables.faixa ? (
                <DataGrid
                  columns={salaryColumnsForDisplay(tables.faixa.columns)}
                  rows={tables.faixa.rows}
                  maxHeightClass="max-h-[480px]"
                />
              ) : null}
            </ChartTablePanel>
          ) : null}
        </ChartCard>
        <ChartCard
          title={`Instrução — salário médio nominal · ${movementLabel}`}
          subtitle="Ranking por escolaridade na população salarial elegível."
          hover={false}
          action={
            <TableToggleButton
              open={tableOpen.instrucao}
              onToggle={() => toggleOptionalTable('instrucao')}
            />
          }
        >
          <BarRank
            rows={currentOverview.salary_profiles[GOLD_COLUMNS.GRAUDEINSTRUCAO]}
            labelKey={GOLD_COLUMNS.GRAUDEINSTRUCAO}
            valueKey={GOLD_COLUMNS.SALARIO_MEDIO}
            color={palette.salary.average}
            highlightTop1
          />
          {tableOpen.instrucao ? (
            <ChartTablePanel open={tableOpen.instrucao}>
              {tables.instrucao ? (
                <DataGrid
                  columns={salaryColumnsForDisplay(tables.instrucao.columns)}
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
            title={`Sexo × faixa etária · ${movementLabel}`}
            subtitle="Intensidade por salário mediano nominal em cada combinação."
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
              valueKey={GOLD_COLUMNS.SALARIO_MEDIANO}
              valueLabel="Salário mediano nominal"
            />
            <ChartTablePanel open={tableOpen.sx_fx}>
              <DataGrid
                columns={salaryColumnsForDisplay(tables.sx_fx.columns)}
                rows={tables.sx_fx.rows}
                maxHeightClass="max-h-[480px]"
              />
            </ChartTablePanel>
          </ChartCard>
        ) : null}

        {tables.sx_ins ? (
          <ChartCard
            title={`Sexo × instrução · ${movementLabel}`}
            subtitle="Intensidade por salário mediano nominal em cada combinação."
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
              valueKey={GOLD_COLUMNS.SALARIO_MEDIANO}
              valueLabel="Salário mediano nominal"
              wide
            />
            <ChartTablePanel open={tableOpen.sx_ins}>
              <DataGrid
                columns={salaryColumnsForDisplay(tables.sx_ins.columns)}
                rows={tables.sx_ins.rows}
                maxHeightClass="max-h-[480px]"
              />
            </ChartTablePanel>
          </ChartCard>
        ) : null}
      </div>

      {tables.fx_ins ? (
        <ChartCard
          title={`Faixa etária × instrução · ${movementLabel}`}
          subtitle="Matriz ampla — intensidade por salário mediano nominal em cada combinação."
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
            valueKey={GOLD_COLUMNS.SALARIO_MEDIANO}
            valueLabel="Salário mediano nominal"
            wide
          />
          <ChartTablePanel open={tableOpen.fx_ins}>
            <DataGrid
              columns={salaryColumnsForDisplay(tables.fx_ins.columns)}
              rows={tables.fx_ins.rows}
              maxHeightClass="max-h-[480px]"
            />
          </ChartTablePanel>
        </ChartCard>
      ) : null}
    </div>
  )
}
