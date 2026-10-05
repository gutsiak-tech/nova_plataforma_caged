import type { ReactNode } from 'react'
import { theme } from '../../lib/theme'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  titleClassName,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  action?: ReactNode
  titleClassName?: string
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className={theme.typography.heroLabel}>{eyebrow}</p>
        <h2 className={titleClassName ?? theme.typography.heroTitle}>{title}</h2>
        {subtitle ? <p className={theme.typography.pageSubtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
