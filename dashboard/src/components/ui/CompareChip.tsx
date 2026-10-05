import type { ReactNode } from 'react'
import clsx from 'clsx'
import { MapPinned } from 'lucide-react'
import type { Scope } from '../../api/types'
import { theme } from '../../lib/theme'

export function CompareChip({
  label,
  value,
  detail,
  active = false,
  className,
  variant = 'default',
  scopeKey,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  active?: boolean
  tone?: 'neutral' | 'positive' | 'negative'
  className?: string
  variant?: 'default' | 'executive'
  scopeKey?: Scope
}) {
  const isExecutive = variant === 'executive'
  const accent = scopeKey ? theme.scopeAccents[scopeKey] : null

  return (
    <div
      className={clsx(
        isExecutive ? theme.compareChip.executiveBaseClass : theme.compareChip.baseClass,
        active
          ? isExecutive
            ? [theme.compareChip.executiveActiveClass, accent?.glow, accent?.ring]
            : theme.compareChip.activeClass
          : isExecutive
            ? [theme.compareChip.executiveInactiveClass, 'opacity-90 hover:opacity-100']
            : theme.compareChip.inactiveClass,
        className,
      )}
      aria-current={active ? 'true' : undefined}
    >
      {isExecutive ? (
        <div className="flex items-start gap-3">
          <div className={clsx(theme.compareChip.executiveIconBoxClass, accent?.icon)}>
            <MapPinned className={clsx('h-4 w-4', accent?.icon)} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className={theme.compareChip.executiveLabelClass}>{label}</p>
            <p className={theme.compareChip.executiveValueClass}>{value}</p>
            {detail ? (
              <p className={theme.compareChip.executiveDetailClass}>{detail}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <p className={theme.compareChip.labelClass}>{label}</p>
          <p className={theme.compareChip.valueClass}>{value}</p>
          {detail ? <p className={theme.compareChip.detailClass}>{detail}</p> : null}
        </>
      )}
    </div>
  )
}
