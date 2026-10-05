import { tokens } from './tokens'

export const chartTheme = {
  grid: {
    stroke: tokens.colors.chart.grid,
    strokeDasharray: '3 3',
  },
  axis: {
    tick: { fill: tokens.colors.chart.tick, fontSize: 11 },
    tickSmall: { fill: tokens.colors.chart.tick, fontSize: 10 },
    label: { fill: tokens.colors.chart.label, fontSize: 11 },
  },
  tooltip: {
    cursorFill: tokens.colors.chart.cursor,
    contentStyle: {
      background: tokens.colors.chart.tooltipBg,
      border: `1px solid ${tokens.colors.chart.tooltipBorder}`,
      borderRadius: 12,
      color: tokens.colors.chart.tooltipText,
      fontSize: 12,
      lineHeight: '1.4',
    } as const,
  },
  palette: {
    movement: {
      admissions: tokens.colors.semantic.positive,
      dismissals: tokens.colors.semantic.negative,
      balancePositive: tokens.colors.semantic.positive,
      balanceNegative: tokens.colors.semantic.negative,
      /** @deprecated use admissions — mantido para MovementSplit */
      admissoes: tokens.colors.semantic.positive,
      /** @deprecated use dismissals — mantido para MovementSplit */
      desligamentos: tokens.colors.semantic.negative,
    },
    territory: {
      primary: tokens.colors.brand.gold,
      municipio: tokens.colors.brand.goldHover,
    },
    sector: {
      primary: tokens.colors.brand.whiteSoft,
    },
    occupation: {
      primary: tokens.colors.brand.gold,
    },
    profile: {
      sex: tokens.colors.brand.gold,
      age: tokens.colors.brand.goldHover,
      education: tokens.colors.brand.goldHover,
    },
    salary: {
      primary: tokens.colors.brand.gold,
      secondary: tokens.colors.brand.goldHover,
      median: tokens.colors.brand.whiteSoft,
      average: tokens.colors.brand.gold,
      positive: tokens.colors.semantic.positive,
      negative: tokens.colors.semantic.negative,
    },
    neutral: {
      grid: tokens.colors.chart.grid,
      axis: tokens.colors.chart.tick,
      tooltip: tokens.colors.chart.tooltipText,
    },
    semantic: {
      positive: tokens.colors.semantic.positive,
      negative: tokens.colors.semantic.negative,
      neutral: tokens.colors.semantic.neutral,
    },
    ranking: {
      default: tokens.colors.brand.gold,
      purple: tokens.colors.brand.goldHover,
      yellow: tokens.colors.brand.gold,
      sky: tokens.colors.brand.whiteSoft,
    },
  },
} as const
