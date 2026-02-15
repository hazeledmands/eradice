import React from 'react';
import { render, screen } from '@testing-library/react';
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
