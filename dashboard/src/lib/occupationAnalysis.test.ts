import { describe, expect, it, vi } from 'vitest'
import type { GoldRow, Scope, TableResponse } from '../api/types'
import { fetchCompleteTable } from './completeTable'
import {
  buildOccupationDeltaData,
  buildOccupationTreemapNodes,
} from './occupationAnalysis'

function row(name: string, saldo: number): GoldRow {
  return { cbo2002ocupacao: name, saldo }
}

function largeFixture() {
  const current: GoldRow[] = []
  const previous: GoldRow[] = []

  for (let index = 0; index < 2001; index += 1) {
    const saldo = 3000 - index
    current.push(row(`Comum ${index}`, saldo))
    previous.push(row(`Comum ${index}`, saldo))
  }

  current.push(
    row('Maior alta real', -5),
    row('Maior queda real', -9000),
    row('Somente atual', -10),
  )
  previous.push(
    row('Maior alta real', -10000),
    row('Maior queda real', 100),
    row('Somente anterior', 25),
  )

  const bySaldoDesc = (left: GoldRow, right: GoldRow) =>
    Number(right.saldo) - Number(left.saldo)

  return {
    current: current.sort(bySaldoDesc),
    previous: previous.sort(bySaldoDesc),
  }
}

function tableResponse(
  rows: GoldRow[],
  offset: number,
  limit: number,
  scope: Scope = 'br',
): TableResponse {
  const pageRows = rows.slice(offset, offset + limit)
  return {
    month: { ano: 2026, mes: 6 },
    scope,
    table: 'tabela_ocupacao',
    columns: ['cbo2002ocupacao', 'saldo'],
    total: rows.length,
    offset,
    count: pageRows.length,
    rows: pageRows,
  }
}

describe('complete occupation table', () => {
  it('loads every page instead of truncating at 2000 rows', async () => {
    const rows = Array.from({ length: 5005 }, (_, index) =>
      row(`Ocupação ${index}`, 5005 - index),
    )
    const fetchPage = vi.fn((limit: number, offset: number) =>
      Promise.resolve(tableResponse(rows, offset, limit)),
    )

    const result = await fetchCompleteTable(fetchPage)

    expect(fetchPage.mock.calls).toEqual([
      [2000, 0],
      [2000, 2000],
      [2000, 4000],
    ])
    expect(result.rows).toHaveLength(5005)
    expect(result.count).toBe(5005)
    expect(result.total).toBe(5005)
  })

  it('propagates a later-page error to the existing page error state', async () => {
    const firstRows = Array.from({ length: 2000 }, (_, index) =>
      row(`Ocupação ${index}`, 3000 - index),
    )
    const fetchPage = vi
      .fn<(limit: number, offset: number) => Promise<TableResponse>>()
      .mockResolvedValueOnce({
        ...tableResponse(firstRows, 0, 2000),
        total: 2001,
      })
      .mockRejectedValueOnce(new Error('Falha na segunda página'))

    await expect(fetchCompleteTable(fetchPage)).rejects.toThrow(
      'Falha na segunda página',
    )
  })
})

describe('occupation delta over the complete universe', () => {
  it('finds the real largest rise and drop beyond the old top 2000', () => {
    const { current, previous } = largeFixture()

    expect(
      current.findIndex((item) => item.cbo2002ocupacao === 'Maior queda real'),
    ).toBeGreaterThanOrEqual(2000)

    const oldTruncated = buildOccupationDeltaData(
      previous.slice(0, 2000),
      current.slice(0, 2000),
    )
    const complete = buildOccupationDeltaData(previous, current)

    expect(oldTruncated.some((item) => item.label === 'Maior queda real')).toBe(false)
    expect(complete.find((item) => item.label === 'Maior alta real')?.deltaAbs).toBe(
      9995,
    )
    expect(complete.find((item) => item.label === 'Maior queda real')?.deltaAbs).toBe(
      -9100,
    )
  })

  it('uses zero for occupations absent from either month', () => {
    const { current, previous } = largeFixture()
    const result = buildOccupationDeltaData(previous, current)

    expect(result.find((item) => item.label === 'Somente atual')).toMatchObject({
      previousValue: 0,
      currentValue: -10,
      deltaAbs: -10,
    })
    expect(result.find((item) => item.label === 'Somente anterior')).toMatchObject({
      previousValue: 25,
      currentValue: 0,
      deltaAbs: -25,
    })
  })

  it.each(['pr', 'rmc'])('keeps the same delta rule for %s', () => {
    const result = buildOccupationDeltaData(
      [row('Comum', 10), row('Somente anterior', 4)],
      [row('Comum', 15), row('Somente atual', 3)],
    )

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Comum', deltaAbs: 5 }),
        expect.objectContaining({ label: 'Somente atual', deltaAbs: 3 }),
        expect.objectContaining({ label: 'Somente anterior', deltaAbs: -4 }),
      ]),
    )
  })
})

describe('occupation treemap over the complete universe', () => {
  it('selects top N by absolute balance after loading every occupation', () => {
    const rows = Array.from({ length: 2000 }, (_, index) =>
      row(`Positiva ${index}`, 3000 - index),
    )
    rows.push(row('Grande saldo negativo', -50000))

    const nodes = buildOccupationTreemapNodes(rows, 40)
    const expected = [...rows]
      .sort((left, right) => Math.abs(Number(right.saldo)) - Math.abs(Number(left.saldo)))
      .slice(0, 40)
      .map((item) => item.cbo2002ocupacao)

    expect(nodes.map((node) => node.name)).toEqual(expected)
    expect(nodes[0]).toMatchObject({
      name: 'Grande saldo negativo',
      signedValue: -50000,
      value: 50000,
    })
  })
})
