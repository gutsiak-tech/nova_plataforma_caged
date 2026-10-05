import { Inbox } from 'lucide-react'

export function EmptyState({
  title = 'Sem dados para este recorte',
  description = 'Não há dados disponíveis para este recorte na competência selecionada.',
}: {
  title?: string
  description?: string
}) {
  return (
    <div
      className="flex min-h-[12rem] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center"
      role="status"
    >
      <Inbox className="mb-3 h-8 w-8 text-slate-500" aria-hidden />
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  )
}
