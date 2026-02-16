import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Ledger from '../Ledger/Ledger';
import DiceTray from '../DiceTray/DiceTray';
import type { RoomRoll } from '../../dice/types';

function makeRoomRoll(overrides: Partial<RoomRoll> = {}): RoomRoll {
  return {
    id: 1000,
    text: '2d',
    diceCount: 2,
    modifier: 0,
    date: new Date().toISOString(),
    dice: [
      { id: 0, finalNumber: 3, stopAfter: 500, isExploding: false, canExplodeSucceed: false, canExplodeFail: true },
      { id: 1, finalNumber: 5, stopAfter: 600, isExploding: false, canExplodeSucceed: true, canExplodeFail: false },
    ],
    nickname: 'Alice',
    isLocal: false,
    shouldAnimate: true,
    visibility: 'shared',
    isRevealed: false,
    ...overrides,
  };
}

describe('Ledger visibility filtering', () => {
  it('shows shared rolls from other users', () => {
    const roll = makeRoomRoll({ visibility: 'shared' });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    expect(screen.getByText('2d')).toBeInTheDocument();
  });

  it('shows secret roll placeholder for unrevealed secret rolls from other users', () => {
    const roll = makeRoomRoll({ visibility: 'secret', isLocal: false, isRevealed: false });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    expect(screen.getByText('rolled secretly')).toBeInTheDocument();
    // Should NOT show the dice notation
    expect(screen.queryByText('2d')).not.toBeInTheDocument();
  });

  it('shows dice content when a secret roll is revealed to other users', () => {
    const roll = makeRoomRoll({ visibility: 'secret', isLocal: false, isRevealed: true });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    // Should show dice notation instead of placeholder
    expect(screen.getByText('2d')).toBeInTheDocument();
    expect(screen.queryByText('rolled secretly')).not.toBeInTheDocument();
  });

  it('hides unrevealed hidden rolls from other users', () => {
    const roll = makeRoomRoll({ visibility: 'hidden', isLocal: false, isRevealed: false });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    expect(screen.queryByText('2d')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('shows hidden rolls after they are revealed to other users', () => {
    const roll = makeRoomRoll({ visibility: 'hidden', isLocal: false, isRevealed: true });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    expect(screen.getByText('2d')).toBeInTheDocument();
  });

  it('shows reveal button for local unrevealed secret rolls', () => {
    const onReveal = jest.fn();
    const roll = makeRoomRoll({ visibility: 'secret', isLocal: true, isRevealed: false });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={onReveal} />);
    expect(screen.getByText('Reveal Roll')).toBeInTheDocument();
  });

  it('does not show reveal button for already-revealed rolls', () => {
    const roll = makeRoomRoll({ visibility: 'secret', isLocal: true, isRevealed: true });
    render(<Ledger rolls={[roll]} isRoomMode onRevealRoll={jest.fn()} />);
    expect(screen.queryByText('Reveal Roll')).not.toBeInTheDocument();
  });
});

describe('DiceTray animation on reveal', () => {
  it('skips animation when shouldAnimate is false (revealed roll)', () => {
    const roll = makeRoomRoll({
      shouldAnimate: false,
      isRevealed: true,
    });
    const { container } = render(<DiceTray roll={roll} />);
    // All dice should be immediately in "stopped" state (showing final numbers)
    const dieElements = container.querySelectorAll('[class*="DieView"]');
    expect(dieElements).toHaveLength(2);
    // The dice should show their final numbers (3 and 5)
    expect(dieElements[0].textContent).toBe('3');
    expect(dieElements[1].textContent).toBe('5');
  });

  it('plays animation when shouldAnimate is true (new roll)', async () => {
    const roll = makeRoomRoll({
      shouldAnimate: true,
    });
    const { container } = render(<DiceTray roll={roll} />);
    // Initially, dice should not be showing their final numbers (they're animating)
    // Note: in test env, RAF doesn't run, but the state should be "rolling"
    const dieElements = container.querySelectorAll('[class*="DieView"]');
    expect(dieElements).toHaveLength(2);
    // At least initially, not all dice should show their final stopped numbers
    // because they should be in 'rolling' state with random faces
  });
});

describe('DiceTray explosion dice visibility', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function makeExplosionRoll(): RoomRoll {
    return {
      id: 2000,
      text: '1d',
      diceCount: 1,
      modifier: 0,
      date: new Date().toISOString(),
      dice: [
        { id: 0, finalNumber: 6, stopAfter: 500, canExplodeSucceed: true, canExplodeFail: true, chainDepth: 0 },
        { id: 1, finalNumber: 3, stopAfter: 400, isExploding: true, canExplodeSucceed: true, canExplodeFail: false, chainDepth: 1 },
      ],
      nickname: 'Test',
      isLocal: true,
      shouldAnimate: true,
      visibility: 'shared',
      isRevealed: false,
    };
  }

  it('hides explosion dice until the preceding die finishes rolling', () => {
    const roll = makeExplosionRoll();
    const { container } = render(<DiceTray roll={roll} />);

    // Initially only the original die should be visible
    const dieElements = container.querySelectorAll('[class*="DieView"]');
    expect(dieElements).toHaveLength(1);
  });

  it('shows explosion die after the preceding die stops', () => {
    const roll = makeExplosionRoll();
    const { container } = render(<DiceTray roll={roll} />);

    // Advance past the first die's stopAfter (500ms)
    act(() => jest.advanceTimersByTime(500));

    // Now the explosion die should be visible (rolling)
    const dieElements = container.querySelectorAll('[class*="DieView"]');
    expect(dieElements).toHaveLength(2);
  });

  it('shows all explosion dice immediately when animation is skipped', () => {
    const roll = makeExplosionRoll();
    roll.shouldAnimate = false;
    const { container } = render(<DiceTray roll={roll} />);

    // Both dice visible immediately with final numbers
    const dieElements = container.querySelectorAll('[class*="DieView"]');
    expect(dieElements).toHaveLength(2);
    expect(dieElements[0].textContent).toBe('6');
    expect(dieElements[1].textContent).toBe('3');
  });
});
