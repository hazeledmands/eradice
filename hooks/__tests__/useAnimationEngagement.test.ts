import { renderHook, act } from '@testing-library/react';
import { useAnimationEngagement } from '../useAnimationEngagement';
import { SLOW_ANIMATION_AFTER_MS, PAUSE_ANIMATION_AFTER_MS } from '../../lib/engagement';

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAnimationEngagement', () => {
  it('starts in active mode', () => {
    const { result } = renderHook(() => useAnimationEngagement());
    expect(result.current).toBe('active');
  });

  it('transitions to slow after the idle threshold', () => {
    const { result } = renderHook(() => useAnimationEngagement());

    act(() => {
      jest.advanceTimersByTime(SLOW_ANIMATION_AFTER_MS + 1_000);
    });

    expect(result.current).toBe('slow');
  });

  it('transitions to paused after the longer idle threshold', () => {
    const { result } = renderHook(() => useAnimationEngagement());

    act(() => {
      jest.advanceTimersByTime(PAUSE_ANIMATION_AFTER_MS + 1_000);
    });

    expect(result.current).toBe('paused');
  });

  it('returns to active on user interaction', () => {
    const { result } = renderHook(() => useAnimationEngagement());

    // Go idle past the slow threshold
    act(() => {
      jest.advanceTimersByTime(SLOW_ANIMATION_AFTER_MS + 1_000);
    });
    expect(result.current).toBe('slow');

    // Simulate user interaction
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    expect(result.current).toBe('active');
  });

  it('pauses when the tab becomes hidden', () => {
    const { result } = renderHook(() => useAnimationEngagement());
    expect(result.current).toBe('active');

    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('paused');
  });

  it('returns to active when the tab becomes visible again', () => {
    const { result } = renderHook(() => useAnimationEngagement());

    // Hide the tab first
    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('paused');

    // Show the tab again
    act(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('active');
  });

  it('cleans up event listeners and interval on unmount', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const clearIntervalSpy = jest.spyOn(window, 'clearInterval');

    const { unmount } = renderHook(() => useAnimationEngagement());
    unmount();

    expect(removeSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
