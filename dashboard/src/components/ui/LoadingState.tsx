import clsx from 'clsx'
import { theme } from '../../lib/theme'

export type LoadingStateVariant = 'solid' | 'skeleton'

export function LoadingState({
  label = 'Carregando dados...',
  rows = 3,
  className,
  fillHeight = true,
  variant = 'solid',
}: {
  label?: string
  rows?: number
  className?: string
  /** Reserva altura mínima para evitar colapso do layout e footer subindo. */
  fillHeight?: boolean
  /** `solid` — indicador discreto sem skeletons; `skeleton` — blocos pulsantes (uso interno). */
  variant?: LoadingStateVariant
}) {
  if (variant === 'solid') {
    return (
      <div
        className={clsx(
          'flex flex-col items-center justify-center gap-3',
          fillHeight && 'min-h-[min(52vh,28rem)]',
          className,
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className={theme.loadingState.spinnerClass} aria-hidden />
        {label ? (
          <p className={clsx(theme.loadingState.labelClass, 'text-center')}>{label}</p>
        ) : null}
      </div>
    )
  }

  const gridCols =
    rows >= 4 ? 'md:grid-cols-3' : rows === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'

  return (
    <div
      className={clsx(
        'space-y-5',
        fillHeight && 'min-h-[min(52vh,28rem)]',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className={theme.loadingState.labelClass}>{label}</p>
      <div className={clsx('grid gap-4', gridCols)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={theme.loadingState.blockClass} aria-hidden />
        ))}
      </div>
    </div>
  )
}
