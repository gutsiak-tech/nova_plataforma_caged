/** Cores compartilhadas entre choropleth e legenda do mapa territorial. */
export const MAP_CHOROPLETH = {
  noData: '#334155',
  neutral: '#64748b',
  positiveMid: '#10b981',
  negativeMid: '#f43f5e',
  positive: ['#34d399', '#10b981', '#059669', '#047857'] as const,
  negative: ['#fb7185', '#f43f5e', '#e11d48', '#be123c'] as const,
  stroke: 'rgba(148, 163, 184, 0.55)',
} as const

export function saldoFillColor(saldo: number | undefined, maxAbs: number): string {
  if (saldo == null || !Number.isFinite(saldo)) return MAP_CHOROPLETH.noData
  if (saldo === 0 || maxAbs <= 0) return MAP_CHOROPLETH.neutral
  const ratio = Math.min(1, Math.abs(saldo) / maxAbs)
  const band = ratio > 0.75 ? 3 : ratio > 0.5 ? 2 : ratio > 0.25 ? 1 : 0
  return saldo > 0 ? MAP_CHOROPLETH.positive[band] : MAP_CHOROPLETH.negative[band]
}
