import type { GoldRow } from '../api/types'
import { GOLD_COLUMNS } from '../api/goldColumns'

export type GeoFeatureProperties = Record<string, unknown>

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: GeoFeatureProperties
    geometry: unknown
  }>
}

export type TerritoryMetricRow = {
  admissoes?: number
  desligamentos?: number
  saldo?: number
  uf?: string
  municipio?: string
}

function stripAccents(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '')
}

/** Compatível com `uf_norm` / `municipio_norm` dos GeoJSONs gerados em M3.1. */
export function normalizeGeoKey(value: string): string {
  const collapsed = stripAccents(value).trim().replace(/\s+/g, ' ')
  return collapsed.toUpperCase()
}

export type MetricIndex = Map<string, TerritoryMetricRow>

export function buildMetricIndex(
  rows: GoldRow[],
  key: typeof GOLD_COLUMNS.UF | typeof GOLD_COLUMNS.MUNICIPIO,
): MetricIndex {
  const index: MetricIndex = new Map()
  for (const row of rows) {
    const raw = String(row[key] ?? '')
    const norm = normalizeGeoKey(raw)
    if (!norm) continue
    index.set(norm, {
      uf: key === GOLD_COLUMNS.UF ? raw : row[GOLD_COLUMNS.UF] != null ? String(row[GOLD_COLUMNS.UF]) : undefined,
      municipio:
        key === GOLD_COLUMNS.MUNICIPIO
          ? raw
          : row[GOLD_COLUMNS.MUNICIPIO] != null
            ? String(row[GOLD_COLUMNS.MUNICIPIO])
            : undefined,
      admissoes: toNumber(row[GOLD_COLUMNS.ADMISSOES]),
      desligamentos: toNumber(row[GOLD_COLUMNS.DESLIGAMENTOS]),
      saldo: toNumber(row[GOLD_COLUMNS.SALDO]),
    })
  }
  return index
}

function toNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export type GeoJoinOptions = {
  joinProperty: 'uf_norm' | 'municipio_norm'
  metricIndex: MetricIndex
}

export function getFeatureJoinKey(
  properties: GeoFeatureProperties,
  joinProperty: GeoJoinOptions['joinProperty'],
): string {
  const fromProperty = properties[joinProperty]
  if (fromProperty != null && String(fromProperty).trim()) {
    return normalizeGeoKey(String(fromProperty))
  }
  if (joinProperty === 'uf_norm') {
    const uf = properties.uf ?? properties.NM_UF
    return uf != null ? normalizeGeoKey(String(uf)) : ''
  }
  const municipio = properties.municipio ?? properties.NM_MUN
  return municipio != null ? normalizeGeoKey(String(municipio)) : ''
}

export function lookupMetric(
  properties: GeoFeatureProperties,
  options: GeoJoinOptions,
): TerritoryMetricRow | undefined {
  const key = getFeatureJoinKey(properties, options.joinProperty)
  if (!key) return undefined
  return options.metricIndex.get(key)
}

export function computeMaxAbsSaldo(index: MetricIndex): number {
  let max = 0
  for (const row of index.values()) {
    const saldo = row.saldo ?? 0
    max = Math.max(max, Math.abs(saldo))
  }
  return max
}

export function joinGeoJsonWithMetrics(
  geoJson: GeoJsonFeatureCollection,
  options: GeoJoinOptions,
): {
  matched: number
  unmatched: number
  maxAbsSaldo: number
  lookup: (properties: GeoFeatureProperties) => TerritoryMetricRow | undefined
} {
  let matched = 0
  let unmatched = 0
  for (const feature of geoJson.features) {
    const metric = lookupMetric(feature.properties ?? {}, options)
    if (metric) matched += 1
    else unmatched += 1
  }
  return {
    matched,
    unmatched,
    maxAbsSaldo: computeMaxAbsSaldo(options.metricIndex),
    lookup: (properties) => lookupMetric(properties, options),
  }
}
