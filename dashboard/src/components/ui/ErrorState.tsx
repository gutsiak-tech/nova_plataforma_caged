import { AlertCircle, RefreshCw } from 'lucide-react'
import { Card } from './Card'

export function ErrorState({
  message,
  onRetry,
  title = 'Não foi possível carregar os dados',
}: {
  message: string
  onRetry?: () => void
  title?: string
}) {
  return (
    <Card hover={false} className="border-rose-500/25 bg-rose-500/5">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-100">{title}</p>
          <p className="mt-1 text-sm text-rose-100/90">{message}</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-rose-200/80">
            <li>Verifique se a API está ativa (uvicorn ou start_stack.ps1).</li>
            <li>Confira o endpoint <code className="rounded bg-black/30 px-1">/ready</code> antes de usar o painel.</li>
            <li>Confirme se a competência selecionada existe na camada Gold.</li>
          </ul>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-50 transition-colors hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
