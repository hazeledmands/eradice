import { renderHook, act } from '@testing-library/react';
import { useTypewriter } from '../useTypewriter';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTypewriter', () => {
  it('starts with empty displayText and isTyping true', () => {
    const { result } = renderHook(() => useTypewriter('Hello'));
    expect(result.current.displayText).toBe('');
    expect(result.current.isTyping).toBe(true);
  });

  it('reveals text character by character over time', () => {
    const { result } = renderHook(() => useTypewriter('Hi', { charDelay: 50 }));

    act(() => { jest.advanceTimersByTime(50); });
    expect(result.current.displayText).toBe('H');

    act(() => { jest.advanceTimersByTime(50); });
    expect(result.current.displayText).toBe('Hi');
  });

  it('sets isTyping to false when all characters have been revealed', () => {
    const { result } = renderHook(() => useTypewriter('AB', { charDelay: 50 }));

    act(() => { jest.advanceTimersByTime(100); });
    expect(result.current.displayText).toBe('AB');
    expect(result.current.isTyping).toBe(false);
  });

  it('uses the default charDelay of 45ms when not specified', () => {
    const { result } = renderHook(() => useTypewriter('X'));

    // Before 45ms: still empty
    act(() => { jest.advanceTimersByTime(44); });
    expect(result.current.displayText).toBe('');

    // After 45ms: first character revealed
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.displayText).toBe('X');
  });

  it('restarts the animation when text changes', () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useTypewriter(text, { charDelay: 50 }),
      { initialProps: { text: 'ABC' } }
    );

    // Partially type 'ABC'
    act(() => { jest.advanceTimersByTime(50); });
    expect(result.current.displayText).toBe('A');

    // Change text — should restart from empty
    rerender({ text: 'XY' });

    // After the rerender, displayText resets; the new interval hasn't fired yet
    expect(result.current.displayText).toBe('');
    expect(result.current.isTyping).toBe(true);

    // Now type through 'XY'
    act(() => { jest.advanceTimersByTime(100); });
    expect(result.current.displayText).toBe('XY');
    expect(result.current.isTyping).toBe(false);
  });

  it('clears the interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useTypewriter('Hello', { charDelay: 50 }));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('handles an empty string without error', () => {
    const { result } = renderHook(() => useTypewriter('', { charDelay: 50 }));

    // For empty string, the interval fires and immediately finds index >= length
    act(() => { jest.advanceTimersByTime(50); });
    expect(result.current.displayText).toBe('');
    expect(result.current.isTyping).toBe(false);
  });
});
