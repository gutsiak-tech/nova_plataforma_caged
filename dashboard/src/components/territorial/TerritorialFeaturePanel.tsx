import { useEffect, useLayoutEffect, useState } from 'react'
import {
  FEATURE_FOCUS_MOVEMENT,
  fetchFeatureFocus,
  peekFeatureFocus,
  type FeatureComparisonParent,
  type FeatureFocusPayload,
  type FeatureTimeseriesPoint,
} from '../../api/featureFocus'
import type { Scope } from '../../api/types'
import { formatCurrencyBRL, formatInt, formatSignedInt, shortCompetenciaLabel } from '../../lib/format'

type PanelStatus =
  | { status: 'loading' }
  | { status: 'ready'; data: FeatureFocusPayload }
  | { status: 'error'; featureId: string; ano: number; mes: number }

function ModuleTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7b12]">
      {children}
    </h2>
  )
}

function formatShare(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

function parentKind(parent: FeatureComparisonParent): string {
  if (parent.level === 'brasil') return 'Brasil'
  return parent.name ?? parent.id
}

export function TerritorialFeaturePanel({
  scope,
  featureId,
  ano,
  mes,
  competenceLabel,
  seed,
  seedError,
  onCompetenceReady,
}: {
  scope: Scope
  featureId: string
  ano: number
  mes: number
  competenceLabel: string
  seed: FeatureFocusPayload | null
  seedError: boolean
  onCompetenceReady?: (ready: boolean) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [panel, setPanel] = useState<PanelStatus>(() => {
    if (seed) return { status: 'ready', data: seed }
    const cached = peekFeatureFocus(scope, featureId, ano, mes)
    if (cached) return { status: 'ready', data: cached }
    if (seedError) return { status: 'error', featureId, ano, mes }
    return { status: 'loading' }
  })
  const cachedNow = peekFeatureFocus(scope, featureId, ano, mes)
  if (
    cachedNow &&
    cachedNow.identity.id === featureId &&
    cachedNow.period.ano === ano &&
    cachedNow.period.mes === mes &&
    (panel.status !== 'ready' ||
      panel.data.identity.id !== featureId ||
      panel.data.period.ano !== ano ||
      panel.data.period.mes !== mes)
  ) {
    setPanel({ status: 'ready', data: cachedNow })
  }

  useEffect(() => {
    if (peekFeatureFocus(scope, featureId, ano, mes)) return
    let cancelled = false
    fetchFeatureFocus(scope, featureId, ano, mes)
      .then((data) => {
        if (cancelled || data.identity.id !== featureId || data.period.ano !== ano || data.period.mes !== mes) {
          return
        }
        setPanel({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setPanel({ status: 'error', featureId, ano, mes })
      })
    return () => {
      cancelled = true
    }
  }, [scope, featureId, ano, mes, attempt])

  const periodReady =
    (panel.status === 'error' &&
      panel.featureId === featureId &&
      panel.ano === ano &&
      panel.mes === mes) ||
    (panel.status === 'ready' &&
      panel.data.identity.id === featureId &&
      panel.data.period.ano === ano &&
      panel.data.period.mes === mes)

  useLayoutEffect(() => {
    onCompetenceReady?.(periodReady)
  }, [onCompetenceReady, periodReady])

  if (panel.status === 'loading') {
    return (
      <div className="pt-1" aria-busy="true" aria-live="polite">
        <p className="text-sm text-[#727d91]">Carregando o território</p>
        <div className="mt-4 h-px w-12 animate-pulse bg-[#ebc617]" />
      </div>
    )
  }

  if (panel.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3 pt-1">
        <p className="max-w-xs text-sm leading-6 text-[#5d6678]">
          Não foi possível abrir os indicadores deste território. O mapa permanece neste enquadramento.
        </p>
        <button
          type="button"
          onClick={() => {
            setPanel({ status: 'loading' })
            setAttempt((current) => current + 1)
          }}
          className="text-sm font-semibold text-[#1a2130] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  const data = panel.data
  const kind = data.identity.level === 'uf' ? 'Unidade da Federação' : 'Município'
  const name = data.identity.name ?? data.identity.id
  const parentName = data.identity.parent.name ?? data.identity.parent.id

  return (
    <div className="territorial-detail-stack flex flex-col gap-4">
      <header className="territorial-context">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a7b12]">{kind}</p>
        <h1 className="mt-1 text-[1.85rem] font-semibold leading-none tracking-[-0.04em] text-[#1a2130]">
          {name}
        </h1>
        <p className="mt-1.5 text-sm text-[#5d6678]">
          {parentName}
          <span className="mx-1.5 text-[#c4bba8]">·</span>
          {competenceLabel}
        </p>
        <div className="mt-3 h-px w-10 bg-[#ebc617]" />
      </header>

      <section className="territorial-section" aria-label="Indicadores">
        <MetricLine label="Admissões" value={formatInt(data.kpis.admissoes)} />
        <MetricLine label="Desligamentos" value={formatInt(data.kpis.desligamentos)} />
        <MetricLine label="Saldo" value={formatSignedInt(data.kpis.saldo)} />
      </section>

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>Remuneração</ModuleTitle>
        {data.salary &&
        (data.salary.salario_medio != null || data.salary.salario_mediano != null) ? (
          <>
            <div className="mt-2.5 space-y-2">
              <MetricLine label="Salário médio" value={formatCurrencyBRL(data.salary.salario_medio)} compact />
              <MetricLine
                label="Salário mediano"
                value={formatCurrencyBRL(data.salary.salario_mediano)}
                compact
              />
            </div>
            <p className="mt-2 text-xs leading-4 text-[#8b93a3]">
              {data.salary.movimento === FEATURE_FOCUS_MOVEMENT ? 'Admissões' : 'Desligamentos'}
              {data.salary.n_salarios_validos != null
                ? ` · ${formatInt(data.salary.n_salarios_validos)} salários válidos`
                : ''}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-[#8b93a3]">Sem salários elegíveis nesta competência.</p>
        )}
      </section>

      {data.comparison.parents.length > 0 ? (
        <section className="territorial-section border-t border-[#e4dfd4] pt-3">
          <ModuleTitle>Comparação</ModuleTitle>
          <div className="mt-2.5 space-y-3">
            {data.comparison.parents.map((parent) => (
              <ParentComparison key={`${parent.level}:${parent.id}`} parent={parent} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>Evolução</ModuleTitle>
        <FeatureSeries points={data.timeseries} activeAno={ano} activeMes={mes} />
      </section>

      <RankSection title="Setores" rows={data.sectors.by_saldo.map((row) => ({ label: row.secao, saldo: row.saldo }))} empty="Sem setores publicados nesta competência." />
      <RankSection
        title="Ocupações"
        rows={data.occupations.by_saldo.map((row) => ({ label: row.cbo2002ocupacao, saldo: row.saldo }))}
        empty="Sem ocupações publicadas nesta competência."
      />

      <section className="territorial-section border-t border-[#e4dfd4] pt-3">
        <ModuleTitle>Perfis</ModuleTitle>
        <div className="mt-2.5 space-y-3">
          <ProfileBlock title="Sexo" rows={data.profiles.sexo.map((row) => ({ label: row.sexo, value: row.admissoes }))} />
          <ProfileBlock
            title="Faixa etária"
            rows={data.profiles.faixa_etaria.map((row) => ({ label: row.faixa_etaria, value: row.admissoes }))}
          />
          <ProfileBlock
            title="Escolaridade"
            rows={data.profiles.graudeinstrucao.map((row) => ({
              label: row.graudeinstrucao,
              value: row.admissoes,
            }))}
          />
        </div>
      </section>
    </div>
  )
}

function MetricLine({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#727d91]">{label}</p>
      <p
        className={
          compact
            ? 'shrink-0 text-[1.15rem] font-semibold leading-none tabular-nums tracking-tight text-[#1a2130]'
            : 'shrink-0 text-[1.45rem] font-semibold leading-none tabular-nums tracking-tight text-[#1a2130]'
        }
      >
        {value}
      </p>
    </div>
  )
}

function ParentComparison({ parent }: { parent: FeatureComparisonParent }) {
  const name = parentKind(parent)
  const admissionShare = formatShare(parent.participation.admissoes)
  const dismissalShare = formatShare(parent.participation.desligamentos)
  const saldoShare =
    parent.participation.saldo_interpretation === 'participacao'
      ? formatShare(parent.participation.saldo)
      : null
  return (
    <div>
      <p className="text-sm leading-5 text-[#1a2130]">
        {admissionShare ? `${admissionShare} das admissões` : 'Admissões'}{' '}
        {parent.level === 'brasil' ? 'do Brasil' : `de ${name}`}
        {dismissalShare ? ` · ${dismissalShare} dos desligamentos` : ''}
        {saldoShare ? ` · ${saldoShare} do saldo` : ''}
      </p>
      {parent.participation.saldo_interpretation === 'sinais_opostos' ? (
        <p className="mt-1 text-xs text-[#8b93a3]">O saldo não é uma fração do território pai.</p>
      ) : null}
      <p className="mt-1 text-xs leading-4 text-[#8b93a3]">
        {name} · {formatMetric(parent.kpis.admissoes)} admissões · {formatMetric(parent.kpis.desligamentos)}{' '}
        desligamentos · saldo {formatSignedInt(parent.kpis.saldo)}
      </p>
    </div>
  )
}

function formatMetric(value: number | null): string {
  return value == null ? '—' : formatInt(value)
}

function RankSection({
  title,
  rows,
  empty,
}: {
  title: string
  rows: Array<{ label: string; saldo: number | null }>
  empty: string
}) {
  const visible = rows.filter((row) => row.saldo != null).slice(0, 5)
  const maxAbs = Math.max(...visible.map((row) => Math.abs(row.saldo ?? 0)), 0)
  return (
    <section className="territorial-section border-t border-[#e4dfd4] pt-3">
      <ModuleTitle>{title}</ModuleTitle>
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-[#8b93a3]">{empty}</p>
      ) : (
        <ol className="mt-2.5 space-y-2">
          {visible.map((row, index) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-[#1a2130]" title={row.label}>
                  <span className="mr-2 text-[10px] font-semibold tracking-[0.14em] text-[#9a7b12]">
                    0{index + 1}
                  </span>
                  {row.label}
                </p>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-[#1a2130]">
                  {formatSignedInt(row.saldo)}
                </p>
              </div>
              <div className="mt-1 h-px bg-[#e4dfd4]">
                <div
                  className="h-px bg-[#1a2130]"
                  style={{ width: maxAbs > 0 ? `${(Math.abs(row.saldo ?? 0) / maxAbs) * 100}%` : '0%' }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function ProfileBlock({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: number | null }>
}) {
  const visible = rows.filter((row) => row.value != null).slice(0, 6)
  const total = visible.reduce((sum, row) => sum + (row.value ?? 0), 0)
  if (visible.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#727d91]">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {visible.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
            <p className="min-w-0 truncate text-sm text-[#1a2130]" title={row.label}>
              {row.label}
            </p>
            <p className="shrink-0 text-xs tabular-nums text-[#5d6678]">
              {total > 0 ? formatShare((row.value ?? 0) / total) : '—'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FeatureSeries({
  points,
  activeAno,
  activeMes,
}: {
  points: FeatureTimeseriesPoint[]
  activeAno: number
  activeMes: number
}) {
  const series = points
    .filter((point) => point.admissoes != null || point.desligamentos != null || point.saldo != null)
    .slice()
    .sort((left, right) => left.ano - right.ano || left.mes - right.mes)

  if (series.length === 0) {
    return <p className="mt-2 text-sm text-[#8b93a3]">Série indisponível para este território.</p>
  }

  const width = 280
  const height = 92
  const left = 22
  const right = 16
  const top = 8
  const bottom = 22
  const flow = series.flatMap((point) => [point.admissoes, point.desligamentos]).filter(isNumber)
  const min = Math.min(...flow, 0)
  const max = Math.max(...flow, 1)
  const xAt = (index: number) =>
    series.length <= 1 ? width / 2 : left + (index * (width - left - right)) / (series.length - 1)
  const yAt = (value: number) => {
    const span = max - min || 1
    return height - bottom - ((value - min) / span) * (height - top - bottom)
  }
  const line = (key: 'admissoes' | 'desligamentos') => {
    let path = ''
    let open = false
    series.forEach((point, index) => {
      const value = point[key]
      if (!isNumber(value)) {
        open = false
        return
      }
      path += `${open ? 'L' : 'M'}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`
      open = true
    })
    return path
  }

  const saldoValues = series.map((point) => point.saldo).filter(isNumber)
  const saldoMin = Math.min(0, ...saldoValues)
  const saldoMax = Math.max(0, ...saldoValues, 1)
  const barTop = 4
  const barHeight = 28
  const baseline = barTop + ((saldoMax - 0) / (saldoMax - saldoMin || 1)) * (barHeight - 8)

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#727d91]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-[#1a2130]" />
          Admissões
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-4 bg-[#9a7b12]" />
          Desligamentos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-[#1a2130]" />
          Saldo
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full" role="img" aria-label="Admissões e desligamentos">
        <path d={line('desligamentos')} fill="none" stroke="#9a7b12" strokeWidth="1.6" strokeLinejoin="round" />
        <path d={line('admissoes')} fill="none" stroke="#1a2130" strokeWidth="1.75" strokeLinejoin="round" />
        {series.map((point, index) => {
          const active = point.ano === activeAno && point.mes === activeMes
          const x = xAt(index)
          return (
            <text
              key={`${point.ano}-${point.mes}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              fill={active ? '#1a2130' : '#8b93a3'}
              fontSize="9"
              fontWeight={active ? 600 : 500}
            >
              {shortCompetenciaLabel(point.mes, point.ano)}
            </text>
          )
        })}
      </svg>
      <svg viewBox={`0 0 ${width} ${barHeight}`} className="h-auto w-full" role="img" aria-label="Saldo na série">
        <line x1={left} x2={width - right} y1={baseline} y2={baseline} stroke="#e4dfd4" strokeWidth="1" />
        {series.map((point, index) => {
          if (!isNumber(point.saldo)) return null
          const slot = series.length <= 1 ? 18 : (width - left - right) / series.length
          const bar = Math.min(14, slot * 0.45)
          const x = xAt(index) - bar / 2
          const y = barTop + ((saldoMax - point.saldo) / (saldoMax - saldoMin || 1)) * (barHeight - 8)
          const h = Math.max(Math.abs(y - baseline), 1)
          return (
            <rect
              key={`${point.ano}-${point.mes}`}
              x={x}
              y={Math.min(y, baseline)}
              width={bar}
              height={h}
              fill={point.saldo < 0 ? '#9a7b12' : '#1a2130'}
              opacity={point.ano === activeAno && point.mes === activeMes ? 1 : 0.45}
            />
          )
        })}
      </svg>
    </div>
  )
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
