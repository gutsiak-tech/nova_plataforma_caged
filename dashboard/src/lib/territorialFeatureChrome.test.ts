import { describe, expect, it } from 'vitest'
import {
  featureChromeOnPose,
  featurePanelPending,
  featurePanelRevealed,
  initialFeatureChrome,
  promoteFeaturePanel,
  type FeatureChromeState,
} from './territorialFeatureChrome'

function held(scope: FeatureChromeState['scope'], id: string): FeatureChromeState {
  return { ...initialFeatureChrome(scope, id), instant: false }
}

describe('feature chrome continuity', () => {
  it('opens the first feature from the parent territory without retaining a panel', () => {
    const next = featureChromeOnPose(null, 'detail:rmc', { kind: 'feature', scope: 'rmc', featureId: '4106902' }, false)
    expect(next).toMatchObject({ id: '4106902', panelId: '4106902', phase: 'approach' })
    expect(featurePanelRevealed(next!)).toBe(false)
  })

  it('keeps feature A on screen while the camera leaves for feature B', () => {
    const current = held('rmc', '4106902')
    const next = featureChromeOnPose(
      current,
      'feature:rmc:4106902',
      { kind: 'feature', scope: 'rmc', featureId: '4104204' },
      false,
    )
    expect(next).toMatchObject({
      id: '4104204',
      panelId: '4106902',
      phase: 'approach',
      crossfade: false,
    })
    expect(featurePanelRevealed(next!)).toBe(true)
    expect(featurePanelPending(next!)).toBe(false)
  })

  it('does not commit B before the camera arrives', () => {
    const moving = featureChromeOnPose(
      held('rmc', '4106902'),
      'feature:rmc:4106902',
      { kind: 'feature', scope: 'rmc', featureId: '4104204' },
      false,
    )!
    const early = promoteFeaturePanel(moving, { scope: 'rmc', id: '4104204', status: 'ready' })
    expect(early.panelId).toBe('4106902')
    const arrived = promoteFeaturePanel(
      { ...moving, phase: 'hold' },
      { scope: 'rmc', id: '4104204', status: 'ready' },
    )
    expect(arrived.panelId).toBe('4104204')
    expect(arrived.crossfade).toBe(true)
    expect(featurePanelRevealed(arrived)).toBe(true)
  })

  it('ignores a late payload after the camera has moved on to C', () => {
    const towardB = featureChromeOnPose(
      held('br', 'RS'),
      'feature:br:RS',
      { kind: 'feature', scope: 'br', featureId: 'SC' },
      false,
    )!
    const towardC = featureChromeOnPose(
      { ...towardB, phase: 'approach' },
      'feature:br:SC',
      { kind: 'feature', scope: 'br', featureId: 'PR' },
      false,
    )!
    const lateB = promoteFeaturePanel(
      { ...towardC, phase: 'hold' },
      { scope: 'br', id: 'SC', status: 'ready' },
    )
    expect(lateB.panelId).toBe('RS')
    expect(lateB.id).toBe('PR')
    const commitC = promoteFeaturePanel(lateB, { scope: 'br', id: 'PR', status: 'ready' })
    expect(commitC.panelId).toBe('PR')
  })

  it('shows a feature error only after arrival and without leaving feature focus', () => {
    const moving = featureChromeOnPose(
      held('pr', '4106902'),
      'feature:pr:4106902',
      { kind: 'feature', scope: 'pr', featureId: '4104204' },
      false,
    )!
    const arrived = promoteFeaturePanel(
      { ...moving, phase: 'hold' },
      { scope: 'pr', id: '4104204', status: 'error' },
    )
    expect(arrived).toMatchObject({ id: '4104204', panelId: '4104204', phase: 'hold' })
    expect(featurePanelRevealed(arrived)).toBe(true)
  })

  it('marks a slow fetch only after the camera has arrived', () => {
    const moving = featureChromeOnPose(
      held('rmc', '4106902'),
      'feature:rmc:4106902',
      { kind: 'feature', scope: 'rmc', featureId: '4101804' },
      false,
    )!
    expect(featurePanelPending(moving)).toBe(false)
    expect(featurePanelPending({ ...moving, phase: 'hold' })).toBe(true)
  })

  it('still closes the feature panel when returning to the parent territory', () => {
    const back = featureChromeOnPose(held('rmc', '4106902'), 'feature:rmc:4106902', { kind: 'detail', scope: 'rmc' }, false)
    expect(back?.phase).toBe('panel-exit')
    expect(featurePanelRevealed(back!)).toBe(false)
  })
})
