import type { LatLngBoundsLiteral } from 'leaflet'
import type { Scope } from '../../api/types'

export const SCOPE_MAP_NOTE: Record<Scope, string> = {
  br: 'Visualização por unidade federativa. A malha municipal nacional ainda não está disponível neste painel.',
  pr: 'Visualização municipal do Paraná com geometria derivada da malha oficial informada no projeto.',
  rmc: 'Visualização da RMC derivada da malha municipal do Paraná, filtrada pela lista de municípios da região metropolitana.',
}

export function formatJoinCoverage(
  scope: Scope,
  matched: number,
  total: number,
  unmatched: number,
): string {
  const base =
    scope === 'br'
      ? `${matched} de ${total} UFs com dados associados`
      : scope === 'rmc'
        ? `${matched} de ${total} municípios da RMC com dados associados`
        : `${matched} de ${total} municípios com dados associados`

  if (unmatched <= 0) return `${base}.`
  const unit = scope === 'br' ? 'UF' : 'município'
  const plural = unmatched === 1 ? unit : scope === 'br' ? 'UFs' : 'municípios'
  return `${base}. ${unmatched} ${plural} sem correspondência na Gold.`
}

export const MAP_FALLBACK = {
  geoLoading: 'Carregando camada cartográfica. A geometria territorial será exibida em instantes.',
  geoError:
    'Camada cartográfica indisponível. Os indicadores territoriais continuam disponíveis abaixo.',
  metricsLoading: 'Carregando métricas territoriais para colorir o mapa…',
  noMetrics:
    'Nenhuma métrica territorial disponível para o recorte e competência selecionados.',
} as const

/** Enquadramento visual do Brasil continental (não altera GeoJSON). Exclui ilhas oceânicas distantes. */
export const BRASIL_FRAMING_BOUNDS: LatLngBoundsLiteral = [
  [-34.0, -74.0],
  [5.5, -34.5],
]

/** Padding do fitBounds por escopo (top/bottom, left/right). */
export const FIT_BOUNDS_PADDING: Record<Scope, [number, number]> = {
  br: [8, 8],
  pr: [28, 28],
  rmc: [44, 44],
}
