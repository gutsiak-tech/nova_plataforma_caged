import { GOLD_COLUMNS } from '../../api/goldColumns'
import type { Scope } from '../../api/types'
import { formatInt, formatSignedInt } from '../../lib/format'
import type { GeoFeatureProperties, TerritoryMetricRow } from '../../lib/geoJoin'

const SALDO_POSITIVE = '#34d399'
const SALDO_NEGATIVE = '#fb7185'
const SALDO_NEUTRAL = '#94a3b8'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function saldoColor(saldo: number | undefined): string {
  if (saldo == null || !Number.isFinite(saldo) || saldo === 0) return SALDO_NEUTRAL
  return saldo > 0 ? SALDO_POSITIVE : SALDO_NEGATIVE
}

function featureTitle(
  properties: GeoFeatureProperties,
  scope: Scope,
  metric: TerritoryMetricRow | undefined,
): { primary: string; secondary?: string } {
  if (scope === 'br') {
    const name = String(properties.uf ?? properties.NM_UF ?? metric?.[GOLD_COLUMNS.UF] ?? 'UF')
    const sigla = properties.uf_sigla != null ? String(properties.uf_sigla) : undefined
    return { primary: name, secondary: sigla }
  }
  const municipio = String(
    properties.municipio ?? properties.NM_MUN ?? metric?.[GOLD_COLUMNS.MUNICIPIO] ?? 'Município',
  )
  const uf =
    properties.uf_sigla != null
      ? String(properties.uf_sigla)
      : metric?.[GOLD_COLUMNS.UF] != null
        ? String(metric[GOLD_COLUMNS.UF])
        : undefined
  return { primary: municipio, secondary: uf }
}

export function buildTerritoryTooltipHtml(
  properties: GeoFeatureProperties,
  scope: Scope,
  metric: TerritoryMetricRow | undefined,
): string {
  const { primary, secondary } = featureTitle(properties, scope, metric)

  if (!metric) {
    return `
      <div class="territory-map-tooltip__body">
        <div class="territory-map-tooltip__title">${escapeHtml(primary)}</div>
        ${secondary ? `<div class="territory-map-tooltip__meta">${escapeHtml(secondary)}</div>` : ''}
        <div class="territory-map-tooltip__empty">Sem métrica associada para o recorte selecionado.</div>
      </div>
    `
  }

  const saldo = metric[GOLD_COLUMNS.SALDO]
  const saldoText = formatSignedInt(saldo)
  const saldoStyle = `color:${saldoColor(saldo)}`

  return `
    <div class="territory-map-tooltip__body">
      <div class="territory-map-tooltip__title">${escapeHtml(primary)}</div>
      ${secondary ? `<div class="territory-map-tooltip__meta">${escapeHtml(secondary)}</div>` : ''}
      <div class="territory-map-tooltip__row"><span>Admissões</span><strong>${formatInt(metric[GOLD_COLUMNS.ADMISSOES])}</strong></div>
      <div class="territory-map-tooltip__row"><span>Desligamentos</span><strong>${formatInt(metric[GOLD_COLUMNS.DESLIGAMENTOS])}</strong></div>
      <div class="territory-map-tooltip__row territory-map-tooltip__saldo"><span>Saldo</span><strong style="${saldoStyle}">${saldoText}</strong></div>
    </div>
  `
}
