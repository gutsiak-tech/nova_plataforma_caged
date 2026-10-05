import { chartTheme } from '../../lib/chartTheme'

const LABEL_MAX_LEN = 32
const VERTICAL_X_LABEL_MAX_LEN = 22
const BAR_ROW_HEIGHT = 32
const CHART_MIN_HEIGHT = 280
const CHART_MAX_HEIGHT = 560

export const HORIZONTAL_BAR_Y_AXIS_WIDTH = 188

export function truncateChartLabel(text: string, maxLen = LABEL_MAX_LEN): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`
}

export function truncateVerticalXLabel(text: string, maxLen = VERTICAL_X_LABEL_MAX_LEN): string {
  return truncateChartLabel(text, maxLen)
}

/** Props compartilhados para eixo X de gráficos de barras verticais (Recharts). */
export const verticalBarXAxisProps = {
  tick: chartTheme.axis.tickSmall,
  interval: 0 as const,
  angle: -28,
  textAnchor: 'end' as const,
  height: 80,
  tickMargin: 6,
}

export function horizontalBarChartHeight(itemCount: number): number {
  return Math.min(
    Math.max(CHART_MIN_HEIGHT, itemCount * BAR_ROW_HEIGHT + 48),
    CHART_MAX_HEIGHT,
  )
}
