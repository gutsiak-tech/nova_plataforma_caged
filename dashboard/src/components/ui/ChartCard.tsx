import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Card } from './Card'
import { EmptyState } from './EmptyState'
import { SectionTitle } from './SectionTitle'
import { theme } from '../../lib/theme'

export function ChartCard({
  title,
  subtitle,
  description,
  children,
  isEmpty = false,
  emptyDescription,
  action,
  footer,
  className,
  hover = true,
  surface = 'default',
}: {
  title: string
  subtitle?: string
  /** Alias retrocompatível para subtitle */
  description?: string
  children: ReactNode
  isEmpty?: boolean
  emptyDescription?: string
  action?: ReactNode
  footer?: ReactNode
  className?: string
  hover?: boolean
  /** `executive` — superfície premium da Visão Executiva. */
  surface?: 'default' | 'executive'
}) {
  const desc = description ?? subtitle
  const cardSurface = surface === 'executive' ? 'executive' : 'translucent'

  return (
    <Card
      surface={cardSurface}
      hover={surface === 'executive' ? false : hover}
      className={className}
    >
      <SectionTitle title={title} subtitle={desc} action={action} />
      {isEmpty ? (
        <EmptyState description={emptyDescription} />
      ) : (
        children
      )}
      {footer ? <div className={clsx(theme.chartCard.footerClass)}>{footer}</div> : null}
    </Card>
  )
}
