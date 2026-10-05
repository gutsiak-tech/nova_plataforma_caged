import clsx from 'clsx'
import type { Scope } from '../../api/types'
import { useScope } from '../../context/ScopeContext'

const SCOPE_HINTS: Record<Scope, string> = {
  br: 'Brasil — visão nacional consolidada.',
  pr: 'Paraná — recorte estadual.',
  rmc: 'Região Metropolitana de Curitiba.',
}

export function ContextHint({ className }: { className?: string }) {
  const { scope } = useScope()
  const hint = SCOPE_HINTS[scope]

  return (
    <div
      className={clsx('flex shrink-0 items-center xl:w-[22rem]', className)}
      title={hint}
    >
      <p className="line-clamp-2 text-sm leading-5 text-slate-400">{hint}</p>
    </div>
  )
}
