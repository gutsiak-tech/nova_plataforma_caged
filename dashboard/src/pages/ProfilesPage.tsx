import { useEffect, useState } from 'react'
import { GOLD_COLUMNS } from '../api/goldColumns'
import { GOLD_TABLES } from '../api/goldTables'
import { fetchOverview, fetchTable } from '../api/gold'
import type { GoldRow, OverviewResponse, TableResponse } from '../api/types'
import { BarRank } from '../components/charts/BarRank'
import { GroupedBarChart } from '../components/charts/GroupedBarChart'
import { DataGrid } from '../components/table/DataGrid'
import { ChartCard } from '../components/ui/ChartCard'
import { ChartTablePanel, TableToggleButton } from '../components/ui/ChartTableToggle'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { useScope } from '../context/ScopeContext'
import { useMonth } from '../context/MonthContext'
import { chartTheme } from '../lib/chartTheme'
import { labelScope } from '../lib/format'
import { useScopeStableLoading } from '../lib/useScopeStableLoading'

const palette = chartTheme.palette

export function ProfilesPage() {
  const { scope } = useScope()
  const { ano, mes, label } = useMonth()
  const [ov, setOv] = useState<OverviewResponse | null>(null)
  const [pairTables, setPairTables] = useState<Record<string, TableResponse | null>>({})
  const [err, setErr] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const { beginFetch, endFetch, shellClass, showInitialLoader } = useScopeStableLoading(ov)
  const [tableOpen, setTableOpen] = useState({
    faixa_instrucao: false,
    sexo_faixa: false,
    sexo_instrucao: false,
  })

  useEffect(() => {
    let c = false
    const isCancelled = () => c
    beginFetch(isCancelled, () => {
      setErr(null)
    })
    Promise.all([
      fetchOverview(scope, ano, mes),
      fetchTable(GOLD_TABLES.PERFIL_SEXO_FAIXA_ETARIA, scope, ano, mes, {
        limit: 400,
        sort_by: GOLD_COLUMNS.SALDO,
      }),
      fetchTable(GOLD_TABLES.PERFIL_SEXO_INSTRUCAO, scope, ano, mes, {
        limit: 400,
        sort_by: GOLD_COLUMNS.SALDO,
      }),
      fetchTable(GOLD_TABLES.PERFIL_FAIXA_ETARIA_INSTRUCAO, scope, ano, mes, {
        limit: 400,
        sort_by: GOLD_COLUMNS.SALDO,
      }),
    ])
      .then(([o, a, b, d]) => {
        if (c) return
        setOv(o)
        setPairTables({ sexo_faixa: a, sexo_instrucao: b, faixa_instrucao: d })
      })
      .catch((e: unknown) => {
        if (!c) setErr(e instanceof Error ? e.message : 'Erro')
      })
      .finally(() => {
        if (!c) endFetch()
      })
    return () => {
      c = true
    }
  }, [scope, ano, mes, retryKey, beginFetch, endFetch])

  if (err) {
    return <ErrorState message={err} onRetry={() => setRetryKey((k) => k + 1)} />
  }
  if (showInitialLoader || !ov) {
    return <LoadingState label="Carregando perfil demográfico..." />
  }

  function pivotPairs(rows: GoldRow[], leftKey: string, topKey: string, valueKey: string) {
    const leftOrder: string[] = []
    const topOrder: string[] = []
    const leftSet = new Set<string>()
    const topSet = new Set<string>()
    const byLeft = new Map<string, Record<string, number>>()

    for (const r of rows) {
      const left = String(r[leftKey] ?? '—')
      const top = String(r[topKey] ?? '—')
      const v = Number(r[valueKey] ?? 0)
      if (!Number.isFinite(v)) continue

      if (!leftSet.has(left)) {
        leftSet.add(left)
        leftOrder.push(left)
      }
      if (!topSet.has(top)) {
        topSet.add(top)
        topOrder.push(top)
      }
      const current = byLeft.get(left) ?? {}
      current[top] = (current[top] ?? 0) + v
      byLeft.set(left, current)
    }

    const data = leftOrder.map((left) => ({ label: left, ...(byLeft.get(left) ?? {}) }))
    return { data, leftOrder, topOrder }
  }

  const faixaInstrucaoPivot = pairTables.faixa_instrucao
    ? pivotPairs(
        pairTables.faixa_instrucao.rows as GoldRow[],
        GOLD_COLUMNS.FAIXA_ETARIA,
        GOLD_COLUMNS.GRAUDEINSTRUCAO,
        GOLD_COLUMNS.SALDO,
      )
    : null
  const sexoFaixaPivot = pairTables.sexo_faixa
    ? pivotPairs(
        pairTables.sexo_faixa.rows as GoldRow[],
        GOLD_COLUMNS.FAIXA_ETARIA,
        GOLD_COLUMNS.SEXO,
        GOLD_COLUMNS.SALDO,
      )
    : null
  const sexoInstrucaoPivot = pairTables.sexo_instrucao
    ? pivotPairs(
        pairTables.sexo_instrucao.rows as GoldRow[],
        GOLD_COLUMNS.GRAUDEINSTRUCAO,
        GOLD_COLUMNS.SEXO,
        GOLD_COLUMNS.SALDO,
      )
    : null

  return (
    <div className={['space-y-10', shellClass].filter(Boolean).join(' ')}>
      <PageHeader
        eyebrow="Perfil"
        title={`Demografia e cruzamentos · ${labelScope(scope)}`}
        subtitle={`Competência ${label}. Dimensões principais e combinações de duas variáveis.`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Sexo"
          subtitle="Distribuição do saldo líquido por sexo no recorte selecionado."
          hover={false}
        >
          <BarRank
            rows={ov.profiles[GOLD_COLUMNS.SEXO]}
            labelKey={GOLD_COLUMNS.SEXO}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.profile.sex}
            highlightTop1
          />
        </ChartCard>
        <ChartCard
          title="Faixa etária"
          subtitle="Distribuição do saldo líquido por faixa etária no recorte selecionado."
          hover={false}
        >
          <BarRank
            rows={ov.profiles[GOLD_COLUMNS.FAIXA_ETARIA]}
            labelKey={GOLD_COLUMNS.FAIXA_ETARIA}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.profile.age}
            highlightTop1
          />
        </ChartCard>
        <ChartCard
          title="Grau de instrução"
          subtitle="Distribuição do saldo líquido por escolaridade no recorte selecionado."
          hover={false}
        >
          <BarRank
            rows={ov.profiles[GOLD_COLUMNS.GRAUDEINSTRUCAO]}
            labelKey={GOLD_COLUMNS.GRAUDEINSTRUCAO}
            valueKey={GOLD_COLUMNS.SALDO}
            color={palette.profile.education}
            highlightTop1
          />
        </ChartCard>
      </div>

      <div className="space-y-6">
        <ChartCard
          title="Faixa etária × instrução (gráfico)"
          subtitle="Saldo líquido por combinação de faixa etária e escolaridade (barras agrupadas)."
          hover={false}
          action={
            pairTables.faixa_instrucao ? (
              <TableToggleButton
                open={tableOpen.faixa_instrucao}
                onToggle={() =>
                  setTableOpen((s) => ({ ...s, faixa_instrucao: !s.faixa_instrucao }))
                }
              />
            ) : null
          }
        >
          {faixaInstrucaoPivot ? (
            <GroupedBarChart
              data={faixaInstrucaoPivot.data}
              series={faixaInstrucaoPivot.topOrder.slice(0, 8)}
            />
          ) : null}
          {pairTables.faixa_instrucao ? (
            <ChartTablePanel open={tableOpen.faixa_instrucao}>
              <DataGrid
                columns={pairTables.faixa_instrucao.columns}
                rows={pairTables.faixa_instrucao.rows}
                maxHeightClass="max-h-[420px]"
              />
            </ChartTablePanel>
          ) : null}
        </ChartCard>

        <ChartCard
          title="Sexo × faixa etária (gráfico)"
          subtitle="Saldo líquido por faixa etária, segmentado por sexo (mês selecionado)."
          hover={false}
          action={
            pairTables.sexo_faixa ? (
              <TableToggleButton
                open={tableOpen.sexo_faixa}
                onToggle={() => setTableOpen((s) => ({ ...s, sexo_faixa: !s.sexo_faixa }))}
              />
            ) : null
          }
        >
          {sexoFaixaPivot ? (
            <GroupedBarChart
              data={sexoFaixaPivot.data}
              series={sexoFaixaPivot.topOrder.slice(0, 3)}
            />
          ) : null}
          {pairTables.sexo_faixa ? (
            <ChartTablePanel open={tableOpen.sexo_faixa}>
              <DataGrid
                columns={pairTables.sexo_faixa.columns}
                rows={pairTables.sexo_faixa.rows}
                maxHeightClass="max-h-[420px]"
              />
            </ChartTablePanel>
          ) : null}
        </ChartCard>

        <ChartCard
          title="Sexo × instrução (gráfico)"
          subtitle="Saldo líquido por escolaridade, segmentado por sexo (mês selecionado)."
          hover={false}
          action={
            pairTables.sexo_instrucao ? (
              <TableToggleButton
                open={tableOpen.sexo_instrucao}
                onToggle={() =>
                  setTableOpen((s) => ({ ...s, sexo_instrucao: !s.sexo_instrucao }))
                }
              />
            ) : null
          }
        >
          {sexoInstrucaoPivot ? (
            <GroupedBarChart
              data={sexoInstrucaoPivot.data}
              series={sexoInstrucaoPivot.topOrder.slice(0, 3)}
              layout="vertical"
              height={420}
              maxBarSize={14}
            />
          ) : null}
          {pairTables.sexo_instrucao ? (
            <ChartTablePanel open={tableOpen.sexo_instrucao}>
              <DataGrid
                columns={pairTables.sexo_instrucao.columns}
                rows={pairTables.sexo_instrucao.rows}
                maxHeightClass="max-h-[420px]"
              />
            </ChartTablePanel>
          ) : null}
        </ChartCard>
      </div>
    </div>
  )
}
