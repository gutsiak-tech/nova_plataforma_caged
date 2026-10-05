import type { ReactNode } from 'react'
import { theme } from '../../lib/theme'

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className={theme.typography.sectionTitle}>{title}</h2>
        {subtitle ? <p className={theme.typography.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
