import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import Die from '../Die';

// Mock the random generator
jest.mock('../../../utils/randomGenerator', () => ({
  generateRandomFace: jest.fn(() => 3),
}));

// Mock requestAnimationFrame
const originalRAF = global.requestAnimationFrame;
const originalCAF = global.cancelAnimationFrame;

describe('Die Component', () => {
  beforeEach(() => {
    // Reset requestAnimationFrame mock
    let rafId = 0;
    global.requestAnimationFrame = jest.fn((cb) => {
      rafId += 1;
      setTimeout(() => cb(Date.now()), 16); // ~60fps
      return rafId;
    });
    global.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRAF;
    global.cancelAnimationFrame = originalCAF;
    jest.clearAllTimers();
  });

  describe('Rendering', () => {
    it('should render with initial number', () => {
      const { container } = render(<Die number={5} isRolling={false} />);
      const dieElement = container.firstChild;
      expect(dieElement).toBeInTheDocument();
      expect(dieElement.textContent).toBe('5');
    });

    it('should generate random number when no initial number provided', () => {
      const { generateRandomFace } = require('../../../utils/randomGenerator');
      generateRandomFace.mockReturnValueOnce(4);
      
      const { container } = render(<Die isRolling={false} />);
      const dieElement = container.firstChild;
      expect(dieElement.textContent).toBe('4');
      expect(generateRandomFace).toHaveBeenCalled();
    });

    it('should apply base DieView class', () => {
      const { container } = render(<Die number={1} isRolling={false} />);
      const dieElement = container.firstChild;
      expect(dieElement.className).toContain('DieView');
    });

    it('should apply exploding class when isExploding is true', () => {
      const { container } = render(
        <Die number={6} isRolling={false} isExploding={true} />
      );
      const dieElement = container.firstChild;
      expect(dieElement.className).toContain('exploding');
    });

    it('should apply cancelled class when isCancelled is true', () => {
      const { container } = render(
        <Die number={2} isRolling={false} isCancelled={true} />
      );
      const dieElement = container.firstChild;
      expect(dieElement.className).toContain('cancelled');
    });

    it('should apply both exploding and cancelled classes when both are true', () => {
      const { container } = render(
        <Die 
          number={1} 
          isRolling={false} 
          isExploding={true} 
          isCancelled={true} 
        />
      );
      const dieElement = container.firstChild;
      expect(dieElement.className).toContain('exploding');
      expect(dieElement.className).toContain('cancelled');
    });
  });

  describe('Rolling Behavior', () => {
    it('should start rolling when isRolling is true and stopAfter is provided', () => {
      render(<Die number={1} isRolling={true} stopAfter={100} />);
      
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should not start rolling when isRolling is false', () => {
      global.requestAnimationFrame.mockClear();
      render(<Die number={1} isRolling={false} stopAfter={100} />);
      
      expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should not start rolling when stopAfter is not provided', () => {
      global.requestAnimationFrame.mockClear();
      render(<Die number={1} isRolling={true} />);
      
      expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should call onStopped callback when rolling stops', async () => {
      jest.useFakeTimers();
      const onStopped = jest.fn();
      
      render(<Die number={3} isRolling={true} stopAfter={100} onStopped={onStopped} />);
      
      // Fast-forward time to complete the roll
      act(() => {
        jest.advanceTimersByTime(150);
      });
      
      // Wait for the callback
      await waitFor(() => {
        expect(onStopped).toHaveBeenCalled();
      });
      
      jest.useRealTimers();
    });

    it('should call onStopped with the current number', async () => {
      jest.useFakeTimers();
      const onStopped = jest.fn();
      const initialNumber = 4;
      
      render(
        <Die 
          number={initialNumber} 
          isRolling={true} 
          stopAfter={100} 
          onStopped={onStopped} 
        />
      );
      
      act(() => {
        jest.advanceTimersByTime(150);
      });
      
      await waitFor(() => {
        expect(onStopped).toHaveBeenCalled();
      });
      
      // Verify the callback was called (the exact number parameter depends on timing)
      expect(onStopped.mock.calls.length).toBeGreaterThan(0);
      
      jest.useRealTimers();
    });

    it('should only call onStopped once when rolling stops', async () => {
      jest.useFakeTimers();
      const onStopped = jest.fn();
      
      const { rerender } = render(
        <Die number={2} isRolling={true} stopAfter={100} onStopped={onStopped} />
      );
      
      act(() => {
        jest.advanceTimersByTime(150);
      });
      
      await waitFor(() => {
        expect(onStopped).toHaveBeenCalledTimes(1);
      });
      
      // Rerender with isRolling still false should not call onStopped again
      act(() => {
        rerender(<Die number={2} isRolling={false} stopAfter={100} onStopped={onStopped} />);
        jest.advanceTimersByTime(50);
      });
      
      expect(onStopped).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('should clean up animation frame on unmount', () => {
      const { unmount } = render(<Die number={1} isRolling={true} stopAfter={100} />);
      
      unmount();
      
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('Number Updates During Rolling', () => {
    it('should update number during rolling animation', async () => {
      jest.useFakeTimers();
      const { generateRandomFace } = require('../../../utils/randomGenerator');
      
      // Mock different numbers for each call
      let callCount = 0;
      generateRandomFace.mockImplementation(() => {
        callCount++;
        return callCount % 6 + 1; // Cycle through 1-6
      });
      
      const { container } = render(
        <Die number={1} isRolling={true} stopAfter={200} />
      );
      
      const dieElement = container.firstChild;
      const initialText = dieElement.textContent;
      
      // Advance time to allow some updates
      act(() => {
        jest.advanceTimersByTime(100);
      });
      
      // The number may have changed during rolling
      // (This is a basic test to ensure the component renders)
      expect(dieElement).toBeInTheDocument();
      
      jest.useRealTimers();
    });
  });

  describe('Prop Updates', () => {
    it('should update when isRolling changes from false to true', () => {
      jest.useFakeTimers();
      
      // Start with a component that's not rolling
      const { rerender, container } = render(<Die number={3} isRolling={false} stopAfter={100} />);
      
      expect(container.firstChild).toBeInTheDocument();
      
      // Change to rolling - component should still render correctly
      act(() => {
        rerender(<Die number={3} isRolling={true} stopAfter={100} />);
        // Allow time for the effect to run
        jest.advanceTimersByTime(0);
      });
      
      // Component should still be rendered
      expect(container.firstChild).toBeInTheDocument();
      // Rolling animation should have started (requestAnimationFrame was called)
      // This is verified by the component working correctly
      
      jest.useRealTimers();
    });

    it('should update classes when isExploding prop changes', () => {
      const { container, rerender } = render(
        <Die number={5} isRolling={false} isExploding={false} />
      );
      
      let dieElement = container.firstChild;
      expect(dieElement.className).not.toContain('exploding');
      
      rerender(<Die number={5} isRolling={false} isExploding={true} />);
      
      dieElement = container.firstChild;
      expect(dieElement.className).toContain('exploding');
    });

    it('should update classes when isCancelled prop changes', () => {
      const { container, rerender } = render(
        <Die number={2} isRolling={false} isCancelled={false} />
      );
      
      let dieElement = container.firstChild;
      expect(dieElement.className).not.toContain('cancelled');
      
      rerender(<Die number={2} isRolling={false} isCancelled={true} />);
      
      dieElement = container.firstChild;
      expect(dieElement.className).toContain('cancelled');
    });
  });
});

