import { beforeEach, describe, expect, it } from 'vitest'
import type { OverviewResponse, Scope, TableResponse } from '../../api/types'
import {
  clearTerritorialFirstPaintCache,
  loadLandingFirstPaint,
  loadTerritorialFirstPaint,
  territorialFirstPaintPlan,
} from './territorialFirstPaint'

function overview(scope: Scope, ano = 2024, mes = 3): OverviewResponse {
  return { scope, month: { ano, mes } } as OverviewResponse
}

function table(scope: Scope, ano = 2024, mes = 3): TableResponse {
  return {
    scope,
    month: { ano, mes },
    table: scope === 'br' ? 'tabela_uf' : 'tabela_municipio',
    total: 1,
    offset: 0,
    count: 1,
    rows: [{}],
  } as TableResponse
}

describe('territorial first paint', () => {
  beforeEach(() => {
    clearTerritorialFirstPaintCache()
  })

  it('names the landing and detail resources that block the first frame', () => {
    expect(territorialFirstPaintPlan({ kind: 'landing', ano: 2024, mes: 3 })).toEqual({
      overviews: ['br', 'pr', 'rmc'],
      geo: 'br',
      table: null,
    })
    expect(
      territorialFirstPaintPlan({ kind: 'detail', scope: 'pr', ano: 2024, mes: 3 }),
    ).toEqual({
      overviews: ['pr'],
      geo: 'pr',
      table: 'pr',
    })
  })

  it('resolves the landing only after the three overviews and the Brazil mesh', async () => {
    const calls: string[] = []
    const paint = await loadTerritorialFirstPaint(
      { kind: 'landing', ano: 2024, mes: 3 },
      {
        fetchOverview: async (scope) => {
          calls.push(`overview:${scope}`)
          return overview(scope)
        },
        fetchTable: async () => {
          calls.push('table')
          throw new Error('fora do primeiro frame')
        },
        fetchGeo: async (scope) => {
          calls.push(`geo:${scope}`)
          return {}
        },
      },
    )

    expect(calls.sort()).toEqual(['geo:br', 'overview:br', 'overview:pr', 'overview:rmc'])
    expect(paint).toMatchObject({ kind: 'landing', key: '2024-3-0', error: false })
  })

  it('keeps a failed landing overview as a finished state', async () => {
    const paint = await loadTerritorialFirstPaint(
      { kind: 'landing', ano: 2024, mes: 4 },
      {
        fetchOverview: async () => {
          throw new Error('overview')
        },
        fetchTable: async () => {
          throw new Error('table')
        },
        fetchGeo: async () => ({}),
      },
    )
    expect(paint).toMatchObject({ kind: 'landing', error: true, overviews: {} })
  })

  it('resolves a direct detail with that scope overview, table and mesh', async () => {
    const calls: string[] = []
    const paint = await loadTerritorialFirstPaint(
      { kind: 'detail', scope: 'rmc', ano: 2024, mes: 5 },
      {
        fetchOverview: async (scope) => {
          calls.push(`overview:${scope}`)
          return overview(scope, 2024, 5)
        },
        fetchTable: async (baseName, scope) => {
          calls.push(`table:${baseName}:${scope}`)
          return table(scope, 2024, 5)
        },
        fetchGeo: async (scope) => {
          calls.push(`geo:${scope}`)
          return {}
        },
      },
    )

    expect(calls.filter((call) => call.startsWith('overview:')).sort()).toEqual([
      'overview:br',
      'overview:pr',
      'overview:rmc',
      'overview:rmc',
    ])
    expect(calls).toContain('table:tabela_municipio:rmc')
    expect(calls).toContain('geo:rmc')
    expect(calls.some((call) => call.includes(':br') && call.startsWith('table'))).toBe(false)
    expect(paint).toMatchObject({
      kind: 'detail',
      scope: 'rmc',
      key: 'rmc:2024:5',
      overviewError: false,
      tableError: false,
    })
  })

  it('still reveals the detail when the mesh fails', async () => {
    const paint = await loadTerritorialFirstPaint(
      { kind: 'detail', scope: 'br', ano: 2024, mes: 6 },
      {
        fetchOverview: async (scope) => overview(scope, 2024, 6),
        fetchTable: async (_baseName, scope) => table(scope, 2024, 6),
        fetchGeo: async () => {
          throw new Error('geo')
        },
      },
    )
    expect(paint.kind).toBe('detail')
    if (paint.kind === 'detail') {
      expect(paint.overviewError).toBe(false)
      expect(paint.tableError).toBe(false)
    }
  })

  it('reuses the landing batch already started for a direct detail', async () => {
    let overviewCalls = 0
    const deps = {
      fetchOverview: async (scope: Scope, ano: number, mes: number) => {
        overviewCalls += 1
        return overview(scope, ano, mes)
      },
      fetchTable: async (_baseName: string, scope: Scope, ano: number, mes: number) =>
        table(scope, ano, mes),
      fetchGeo: async () => ({}),
    }
    await loadTerritorialFirstPaint({ kind: 'detail', scope: 'pr', ano: 2024, mes: 7 }, deps)
    await loadLandingFirstPaint(2024, 7, { deps })
    expect(overviewCalls).toBe(4)
  })
})
