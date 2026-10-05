import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { GoldRow } from '../../api/types'
import { EmptyState } from '../ui/EmptyState'

type Props = {
  columns: string[]
  rows: GoldRow[]
  maxHeightClass?: string
}

export function DataGrid({ columns, rows, maxHeightClass = 'max-h-[520px]' }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])

  const defs = useMemo<ColumnDef<GoldRow>[]>(() => {
    return columns.map((c) => ({
      id: c,
      accessorKey: c,
      header: c,
      cell: (info) => {
        const v = info.getValue()
        if (v === null || v === undefined) return <span className="text-slate-600">—</span>
        if (typeof v === 'number')
          return <span className="tabular-nums">{v.toLocaleString('pt-BR')}</span>
        return <span>{String(v)}</span>
      },
      sortingFn: (rowA, rowB, columnId) => {
        const a = rowA.getValue(columnId)
        const b = rowB.getValue(columnId)
        const na = typeof a === 'number' ? a : Number(a)
        const nb = typeof b === 'number' ? b : Number(b)
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb ? 0 : na > nb ? 1 : -1
        return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR')
      },
    }))
  }, [columns])

  // TanStack Table exposes unstable function refs; React Compiler skips memoization by design.
  // eslint-disable-next-line react-hooks/incompatible-library -- useReactTable is the supported API
  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (!rows.length) {
    return (
      <EmptyState
        title="Tabela sem registros"
        description="Não há dados disponíveis para este recorte na competência selecionada."
      />
    )
  }

  return (
    <div className="space-y-2">
    <div
      className={clsx(
        'overflow-auto rounded-xl border border-white/10 bg-slate-950/40',
        maxHeightClass,
      )}
    >
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur-md">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-white/10">
              {hg.headers.map((h) => (
                <th key={h.id} className="whitespace-nowrap px-3 py-2 font-medium text-slate-300">
                  {h.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={clsx(
                        'inline-flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-white/5',
                        h.column.getCanSort() && 'cursor-pointer select-none',
                      )}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === 'asc' ? '↑' : null}
                      {h.column.getIsSorted() === 'desc' ? '↓' : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 text-slate-200">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="text-right text-xs text-slate-500">
      {rows.length.toLocaleString('pt-BR')} registro(s) exibido(s)
      {rows.length >= 500 ? ' · limite da consulta pode truncar resultados' : ''}
    </p>
    </div>
  )
}
