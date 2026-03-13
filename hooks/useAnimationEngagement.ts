import { useEffect, useRef, useState } from 'react';
import { AnimationMode, resolveAnimationMode } from '../lib/engagement';

export function useAnimationEngagement() {
  const lastInteractionRef = useRef<number>(Date.now());
  const [mode, setMode] = useState<AnimationMode>('active');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recomputeMode = () => {
      const nextMode = resolveAnimationMode(Date.now() - lastInteractionRef.current, document.hidden);
      setMode((prev) => (prev === nextMode ? prev : nextMode));
    };

    const markEngaged = () => {
      lastInteractionRef.current = Date.now();
      setMode((prev) => (prev === 'active' ? prev : 'active'));
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        markEngaged();
        return;
      }
      recomputeMode();
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
      'focus',
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, markEngaged, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(recomputeMode, 1_000);
    recomputeMode();

    return () => {
      window.clearInterval(intervalId);
      for (const eventName of events) {
        window.removeEventListener(eventName, markEngaged);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return mode;
}
