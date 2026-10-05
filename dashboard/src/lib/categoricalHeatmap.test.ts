import { describe, expect, it } from 'vitest'
import heatmapComponentSource from '../components/charts/CategoricalHeatmap.tsx?raw'
import { GOLD_COLUMNS } from '../api/goldColumns'
import {
  buildCategoricalHeatmap,
  HEATMAP_TOOLTIP_METRICS,
  HEATMAP_VALUE_KEY,
  isSmallSalarySample,
} from './categoricalHeatmap'

describe('institutional salary heatmap', () => {
  const rows = [
    {
      sexo: 'Mulher',
      faixa_etaria: '18 a 24 anos',
      salario_mediano: 2000,
      salario_medio: 500000,
      n_salarios_validos: 29,
    },
    {
      sexo: 'Homem',
      faixa_etaria: '18 a 24 anos',
      salario_mediano: 2100,
      salario_medio: 2200,
      n_salarios_validos: 30,
    },
  ]

  it('uses nominal median as the primary intensity', () => {
    const heatmap = buildCategoricalHeatmap(
      rows,
      GOLD_COLUMNS.SEXO,
      GOLD_COLUMNS.FAIXA_ETARIA,
    )

    expect(HEATMAP_VALUE_KEY).toBe(GOLD_COLUMNS.SALARIO_MEDIANO)
    expect(heatmap.valueKey).toBe(GOLD_COLUMNS.SALARIO_MEDIANO)
    expect(heatmap.min).toBe(2000)
    expect(heatmap.max).toBe(2100)
    expect(heatmap.cells[0].value).toBe(2000)
  })

  it('does not let an extreme mean change median intensity', () => {
    const original = buildCategoricalHeatmap(
      rows,
      GOLD_COLUMNS.SEXO,
      GOLD_COLUMNS.FAIXA_ETARIA,
    )
    const changed = buildCategoricalHeatmap(
      [{ ...rows[0], salario_medio: 999999999 }, rows[1]],
      GOLD_COLUMNS.SEXO,
      GOLD_COLUMNS.FAIXA_ETARIA,
    )

    expect(changed.cells.map((cell) => cell.value)).toEqual(
      original.cells.map((cell) => cell.value),
    )
    expect([changed.min, changed.max]).toEqual([original.min, original.max])
  })

  it('always exposes N and flags only samples below 30', () => {
    expect(
      HEATMAP_TOOLTIP_METRICS.some(
        (metric) => metric.key === GOLD_COLUMNS.N_SALARIOS_VALIDOS,
      ),
    ).toBe(true)
    expect(isSmallSalarySample(29)).toBe(true)
    expect(isSmallSalarySample(30)).toBe(false)
    expect(heatmapComponentSource).toContain('Amostra pequena (N &lt; 30)')
  })

  it('does not expose raw min and max in the tooltip', () => {
    const keys = HEATMAP_TOOLTIP_METRICS.map((metric) => metric.key)
    expect(keys).not.toContain(GOLD_COLUMNS.SALARIO_MIN)
    expect(keys).not.toContain(GOLD_COLUMNS.SALARIO_MAX)
  })
})
