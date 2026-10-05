import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Table2 } from 'lucide-react'
import { theme } from '../../lib/theme'

export function TableToggleButton({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={clsx(theme.chartTable.toggleClass, open && theme.chartTable.toggleActiveClass)}
      aria-expanded={open}
      aria-label={open ? 'Ocultar tabela' : 'Ver dados tabulares'}
      title={open ? 'Ocultar tabela' : 'Ver dados tabulares'}
      onClick={onToggle}
    >
      <Table2 className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

export function ChartCardActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>
}

export function ChartTablePanel({
  open,
  children,
  className,
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  if (!open) return null
  return <div className={clsx(theme.chartTable.panelClass, className)}>{children}</div>
}
