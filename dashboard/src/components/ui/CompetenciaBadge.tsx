import clsx from 'clsx'
import { CalendarDays } from 'lucide-react'
import { useMonth } from '../../context/MonthContext'

export function CompetenciaBadge({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const { label, competencia, loading } = useMonth()

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] text-sm',
        compact ? 'px-2 py-1 text-xs' : 'rounded-xl px-3 py-1.5',
        className,
      )}
      title="Competência selecionada (preservada ao recarregar a página)"
    >
      <CalendarDays
        className={clsx('shrink-0 text-cyan-300/70', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        aria-hidden
      />
      {!compact ? <span className="text-slate-400">Competência:</span> : null}
      <span className={clsx('font-medium text-slate-100', compact && 'tabular-nums')}>
        {loading ? '...' : label || competencia}
      </span>
    </div>
  )
}
