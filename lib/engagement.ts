export const SLOW_ANIMATION_AFTER_MS = 60_000;
export const PAUSE_ANIMATION_AFTER_MS = 120_000;

export type AnimationMode = 'active' | 'slow' | 'paused';

export function resolveAnimationMode(idleMs: number, isDocumentHidden: boolean): AnimationMode {
  if (isDocumentHidden || idleMs >= PAUSE_ANIMATION_AFTER_MS) {
    return 'paused';
  }
  if (idleMs >= SLOW_ANIMATION_AFTER_MS) {
    return 'slow';
  }
  return 'active';
}
