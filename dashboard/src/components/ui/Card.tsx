import clsx from 'clsx'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { theme } from '../../lib/theme'

export function Card({
  children,
  className,
  hover = true,
  surface = 'default',
  animate = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  /** `translucent` — superfície grafite dos cards de gráfico (páginas internas). */
  /** `executive` — superfície premium da Visão Executiva. */
  surface?: 'default' | 'translucent' | 'executive'
  /** Entrada sutil (sem opacity 0) — desligada por padrão para evitar flicker no carregamento. */
  animate?: boolean
}) {
  const classes = clsx(
    surface === 'executive'
      ? [theme.card.translucentClass, theme.chartCard.executiveSurfaceClass]
      : surface === 'translucent'
        ? [theme.card.translucentClass, theme.chartCard.surfaceClass]
        : theme.card.baseClass,
    hover && theme.card.hoverClass,
    className,
  )

  if (!animate) {
    return <div className={classes}>{children}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 1, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={classes}
    >
      {children}
    </motion.div>
  )
}
