import { describe, expect, it } from 'vitest'
import { contentSquare, flightStableSize, flightTransform } from './territorialFlight'

const landing = { left: 854.5, top: 259.1, width: 432, height: 432 }
const detail = { left: 360, top: 69, width: 1080, height: 831 }

describe('territorial flight transform', () => {
  it('fits the square viewBox inside each slot without stretching', () => {
    expect(contentSquare(landing)).toEqual({ left: 854.5, top: 259.1, size: 432 })
    expect(contentSquare(detail)).toEqual({ left: 484.5, top: 69, size: 831 })
  })

  it('keeps one stable size and a single scale between the two rectangles', () => {
    const stable = flightStableSize(landing, detail)
    expect(stable).toBe(831)
    expect(flightTransform(landing, stable)).toEqual({
      x: 854.5,
      y: 259.1,
      scale: 432 / 831,
    })
    expect(flightTransform(detail, stable)).toEqual({
      x: 484.5,
      y: 69,
      scale: 1,
    })
  })
})
