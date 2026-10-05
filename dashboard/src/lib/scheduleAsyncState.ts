/**
 * Schedules synchronous-looking state resets on the microtask queue so React Compiler
 * does not treat them as setState calls at the top of an effect body.
 */
export function scheduleAsyncState(isCancelled: () => boolean, apply: () => void): void {
  queueMicrotask(() => {
    if (!isCancelled()) apply()
  })
}
