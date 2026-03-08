import React from 'react';
import { render } from '@testing-library/react';
import DiceTray from '../DiceTray/DiceTray';
import type { Roll } from '../../dice/types';

// Track ResizeObserver instantiations
let observerCount = 0;
const OriginalResizeObserver = global.ResizeObserver;

beforeEach(() => {
  observerCount = 0;
  global.ResizeObserver = class extends OriginalResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      super(cb);
      observerCount++;
    }
  };
});

afterEach(() => {
  global.ResizeObserver = OriginalResizeObserver;
});

function makeRoll(id: number): Roll {
  return {
    id,
    text: '2d',
    diceCount: 2,
    modifier: 0,
    date: new Date().toISOString(),
    dice: [
      { id: 0, finalNumber: 3, stopAfter: 500, isExploding: false, canExplodeSucceed: false, canExplodeFail: true },
      { id: 1, finalNumber: 5, stopAfter: 600, isExploding: false, canExplodeSucceed: true, canExplodeFail: false },
    ],
    shouldAnimate: false,
  };
}

describe('DiceTray ResizeObserver usage', () => {
  it('does not create a ResizeObserver when showFractal is false', () => {
    render(<DiceTray roll={makeRoll(1)} showFractal={false} />);
    expect(observerCount).toBe(0);
  });

  it('creates a ResizeObserver when showFractal is true', () => {
    render(<DiceTray roll={makeRoll(2)} showFractal={true} />);
    expect(observerCount).toBe(1);
  });
});
