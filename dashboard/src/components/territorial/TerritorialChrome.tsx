import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Scope } from '../../api/types'
import { useMonth } from '../../context/MonthContext'
import {
  retreatTerritorialHistory,
  territorialDetailLocation,
  territorialLandingLocation,
} from '../../lib/territorialPose'
import { territoryOption } from '../../lib/territorialSummary'
import { TerritorialBrand } from './TerritorialBrand'

export function TerritorialChrome({
  pose,
  scope,
  featureBack,
  featureLeaving = false,
}: {
  pose: 'landing' | 'detail'
  scope: Scope
  featureBack: boolean
  featureLeaving?: boolean
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { competencia, competencias, setCompetencia } = useMonth()
  const territory = territoryOption(scope)
  const search = searchParams.toString()

  return (
    <header
      className="territorial-persistent-header"
      data-pose={pose}
      data-territorial-header=""
    >
      <TerritorialBrand />
      {pose === 'detail' ? (
        <>
          <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-[#1a2130]">
            {territory.name}
          </p>
          <div className="flex items-center justify-end gap-4 sm:gap-5">
            {featureBack ? (
              <button
                type="button"
                onClick={() => {
                  if (featureLeaving) return
                  retreatTerritorialHistory(
                    navigate,
                    territorialDetailLocation(scope, search),
                  )
                }}
                aria-label="Voltar ao mapa do território"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Voltar
              </button>
            ) : (
              <Link
                to={territorialLandingLocation(search)}
                aria-label="Voltar à entrada territorial"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5d6678] underline-offset-4 hover:text-[#1a2130] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617]"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Voltar
              </Link>
            )}
            <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#727d91]">
              Competência
              <select
                value={competencia}
                onChange={(event) => setCompetencia(event.target.value)}
                className="mt-0.5 block w-[11.5rem] border-0 border-b border-[#1a2130] bg-transparent pb-0.5 text-sm font-semibold normal-case tracking-normal text-[#1a2130] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebc617] sm:w-52"
              >
                {competencias.map((item) => (
                  <option key={item.competencia} value={item.competencia}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : null}
    </header>
  )
}
