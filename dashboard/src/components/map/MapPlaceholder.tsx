import { MapPinned } from 'lucide-react'
import { Card } from '../ui/Card'

type MapPlaceholderProps = {
  message?: string
}

export function MapPlaceholder({ message }: MapPlaceholderProps) {
  const body =
    message ??
    'O painel já organiza o recorte municipal em tabelas e rankings. Quando o pipeline de tiles/PostGIS estiver estável, este painel receberá um mapa coroplético ligado aos mesmos identificadores territoriais.'

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(34,211,238,0.12),transparent_40%,rgba(99,102,241,0.12))]" />
      <div className="relative flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-cyan-500/15 p-2 ring-1 ring-cyan-400/20">
            <MapPinned className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Camada cartográfica</h3>
            <p className="mt-1 max-w-prose text-sm text-slate-400">{body}</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-xs text-slate-500">
          {message ? 'Mapa indisponível' : 'Placeholder intencional · integração futura'}
        </div>
      </div>
    </Card>
  )
}
