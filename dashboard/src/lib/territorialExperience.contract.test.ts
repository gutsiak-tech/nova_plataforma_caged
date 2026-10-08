import { describe, expect, it } from 'vitest'
import experienceSource from '../components/territorial/TerritorialExperience.tsx?raw'
import stageSource from '../components/territorial/TerritorialMapStage.tsx?raw'
import landingSource from '../pages/TerritorialLandingPage.tsx?raw'
import detailSource from '../pages/TerritorialDetailPage.tsx?raw'
import appSource from '../App.tsx?raw'
import poseSource from './territorialPose.ts?raw'
import geometrySource from './territorialGeometry.ts?raw'
import monthSource from '../context/MonthContext.tsx?raw'
import documentSource from '../../index.html?raw'
import {
  resolveTerritorialPose,
  territorialDetailLocation,
  territorialFeatureLocation,
  territorialLandingLocation,
  territorialMoveDuration,
  TERRITORIAL_MOVE_MS,
} from './territorialPose'

const files: Record<string, string> = {
  experience: experienceSource,
  stage: stageSource,
  landing: landingSource,
  detail: detailSource,
  app: appSource,
  pose: poseSource,
  geometry: geometrySource,
}

describe('territorial pose', () => {
  it('resolves the landing route', () => {
    expect(resolveTerritorialPose('/territorial')).toEqual({ kind: 'landing' })
    expect(resolveTerritorialPose('/territorial/')).toEqual({ kind: 'landing' })
  })

  it('resolves the three detail routes and a direct path', () => {
    expect(resolveTerritorialPose('/territorial/brasil')).toEqual({ kind: 'detail', scope: 'br' })
    expect(resolveTerritorialPose('/territorial/parana')).toEqual({ kind: 'detail', scope: 'pr' })
    expect(resolveTerritorialPose('/territorial/rmc')).toEqual({ kind: 'detail', scope: 'rmc' })
  })

  it('rejects an unknown detail path', () => {
    expect(resolveTerritorialPose('/territorial/paraná')).toEqual({ kind: 'invalid' })
    expect(resolveTerritorialPose('/territorial/brasil/extra')).toEqual({ kind: 'invalid' })
    expect(resolveTerritorialPose('/territorial/parana/sp')).toEqual({ kind: 'invalid' })
    expect(resolveTerritorialPose('/territorial/brasil/sp/extra')).toEqual({ kind: 'invalid' })
  })

  it('resolves a feature focus route without replacing the detail route', () => {
    expect(resolveTerritorialPose('/territorial/brasil/sp')).toEqual({
      kind: 'feature',
      scope: 'br',
      featureId: 'SP',
    })
    expect(resolveTerritorialPose('/territorial/parana/4106902')).toEqual({
      kind: 'feature',
      scope: 'pr',
      featureId: '4106902',
    })
    expect(resolveTerritorialPose('/territorial/rmc/4106902')).toEqual({
      kind: 'feature',
      scope: 'rmc',
      featureId: '4106902',
    })
    expect(territorialFeatureLocation('br', 'SP', 'ano=2026&mes=2')).toEqual({
      pathname: '/territorial/brasil/sp',
      search: 'ano=2026&mes=2',
    })
    expect(territorialFeatureLocation('pr', '4106902').pathname).toBe('/territorial/parana/4106902')
  })

  it('builds one detail location and one return location, keeping the search', () => {
    expect(territorialDetailLocation('pr', 'competencia=2024-01')).toEqual({
      pathname: '/territorial/parana',
      search: 'competencia=2024-01',
    })
    expect(territorialLandingLocation('competencia=2024-01')).toEqual({
      pathname: '/territorial',
      search: 'competencia=2024-01',
    })
    expect(territorialDetailLocation('br').pathname).toBe('/territorial/brasil')
    expect(territorialDetailLocation('rmc').pathname).toBe('/territorial/rmc')
  })

  it('skips the move when reduced motion is requested', () => {
    expect(territorialMoveDuration(true)).toBe(0)
    expect(territorialMoveDuration(false)).toBe(TERRITORIAL_MOVE_MS)
  })
})

describe('territorial experience contract', () => {
  const architecture = Object.values(files).join('\n')

  it('does not use a timer, a cloned renderer, or a second geography', () => {
    const forbidden = [
      'setTimeout',
      'requestAnimationFrame',
      'dangerouslySetInnerHTML',
      'freezeLandingBox',
      'TerritorialTransitionOverlay',
      'innerHTML',
      'react-leaflet',
      "from 'leaflet'",
      'scaleX',
      'scaleY',
      'TerritoryMiniMap',
      'TerritorialDetailMap',
    ]
    for (const pattern of forbidden) {
      expect(architecture, pattern).not.toContain(pattern)
    }
  })

  it('keeps one persistent stage and both chromes in the same experience', () => {
    expect(files.experience).toContain('TerritorialLandingPage')
    expect(files.experience).toContain('TerritorialDetailPage')
    expect(files.experience.match(/<TerritorialMapStage/g)).toHaveLength(1)
    expect(files.experience).toContain('onMoveComplete={releaseMove}')
    expect(files.experience).not.toContain("pose.kind === 'landing' &&")
    expect(files.stage).toContain('onAnimationComplete={onMoveComplete}')
    expect(files.stage).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(files.stage).toContain('CANONICAL_VIEW_BOX')
  })

  it('opens and returns with one navigation each', () => {
    expect(files.landing).toContain(
      'navigate(territorialDetailLocation(selected, searchParams.toString()))',
    )
    expect(files.detail).toContain('territorialLandingLocation(searchParams.toString())')
    expect(files.landing).not.toContain('setTimeout')
    expect(files.detail).not.toContain('setTimeout')
  })

  it('mounts the experience once for landing and detail', () => {
    expect(files.app).toContain('TerritorialExperience')
    expect(files.app).not.toContain('TerritorialLandingPage')
    expect(files.app).not.toContain('TerritorialDetailPage')
    expect(files.app).toContain('path="territorial"')
    expect(files.app).toContain('path=":territory"')
    expect(files.app).toContain('path=":territory/:featureId"')
  })

  it('does not add territorial bootstrap to the month context or the document', () => {
    expect(monthSource).not.toMatch(/territorial|preboot|freezeLanding/i)
    expect(documentSource).not.toMatch(/preboot|territorial-experience/i)
  })

  it('keeps the legacy page loader and gates the territorial route on its own loader', () => {
    const territorialRoute = files.app.slice(
      files.app.indexOf('path="territorial"'),
      files.app.indexOf('<Route element={<AppShell />}>'),
    )
    expect(territorialRoute).toContain('TerritorialRouteLoading')
    expect(territorialRoute).not.toContain('PageFallback')
    expect(files.app).toContain('Carregando página...')
    expect(files.experience).toContain('loadTerritorialFirstPaint')
    expect(files.experience).toContain('TerritorialRouteLoading')
    expect(files.landing).not.toContain('setTimeout')
    expect(files.detail).not.toContain('setTimeout')
  })
})
