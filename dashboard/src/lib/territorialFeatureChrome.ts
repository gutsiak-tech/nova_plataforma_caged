import type { Scope } from '../api/types'
import type { TerritorialPose } from './territorialPose'

export type FeatureChromePhase = 'approach' | 'hold' | 'panel-exit' | 'return'

/** Camera target (`id`) and the feature still painted in the side panel (`panelId`). */
export type FeatureChromeState = {
  scope: Scope
  id: string
  panelId: string
  phase: FeatureChromePhase
  instant: boolean
  crossfade: boolean
}

export type FeaturePanelResolution = {
  scope: Scope
  id: string
  status: 'ready' | 'error'
}

export function initialFeatureChrome(scope: Scope, featureId: string): FeatureChromeState {
  return {
    scope,
    id: featureId,
    panelId: featureId,
    phase: 'hold',
    instant: true,
    crossfade: false,
  }
}

/**
 * Route changes update the camera immediately.
 * A feature-to-feature move keeps the previous panel until the new payload is committed.
 */
export function featureChromeOnPose(
  previous: FeatureChromeState | null,
  previousToken: string | null,
  pose: TerritorialPose,
  reduced: boolean,
): FeatureChromeState | null {
  if (pose.kind === 'feature') {
    if (
      previous &&
      previous.scope === pose.scope &&
      previous.id === pose.featureId &&
      (previous.phase === 'hold' || previous.phase === 'approach')
    ) {
      return previous
    }
    const fromMap =
      previousToken === `detail:${pose.scope}` ||
      (previousToken?.startsWith(`feature:${pose.scope}:`) ?? false)
    const instant = reduced || !fromMap
    const phase = instant ? 'hold' : 'approach'
    const retain = previous != null && previous.scope === pose.scope && previous.phase !== 'return'
    return {
      scope: pose.scope,
      id: pose.featureId,
      panelId: retain ? previous.panelId : pose.featureId,
      phase,
      instant,
      crossfade: false,
    }
  }

  if (pose.kind === 'detail') {
    if (!previous || previous.scope !== pose.scope) return null
    if (previous.phase === 'approach' || reduced) {
      return { ...previous, phase: 'return', instant: false, crossfade: false }
    }
    if (previous.phase === 'hold' || previous.phase === 'panel-exit') {
      return { ...previous, phase: 'panel-exit', instant: false, crossfade: false }
    }
    return previous
  }

  return null
}

/** Commit the panel only for the feature that is still the camera target, and only after arrival. */
export function promoteFeaturePanel(
  current: FeatureChromeState,
  result: FeaturePanelResolution | null,
): FeatureChromeState {
  if (!result) return current
  if (current.scope !== result.scope || current.id !== result.id) return current
  if (current.panelId === current.id) return current
  const arrived = current.phase === 'hold' || current.instant
  if (!arrived) return current
  return { ...current, panelId: current.id, crossfade: !current.instant }
}

export function featurePanelRevealed(state: FeatureChromeState): boolean {
  if (state.phase === 'return' || state.phase === 'panel-exit') return false
  if (state.phase === 'hold') return true
  return state.panelId !== state.id
}

export function featurePanelPending(state: FeatureChromeState): boolean {
  return state.panelId !== state.id && (state.phase === 'hold' || state.instant)
}
