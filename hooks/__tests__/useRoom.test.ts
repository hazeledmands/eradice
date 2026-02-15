import { renderHook, act } from '@testing-library/react';

// jest.mock is hoisted, so we define the mock inline
jest.mock('../../lib/supabase', () => {
  const mockTrack = jest.fn().mockResolvedValue(undefined);
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockImplementation((cb) => {
      setTimeout(() => cb('SUBSCRIBED'), 0);
      return mockChannel;
    }),
    presenceState: jest.fn().mockReturnValue({}),
    track: mockTrack,
  };

  const mockFrom = jest.fn().mockImplementation((table: string) => {
    if (table === 'rooms') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'room-1', slug: 'test-room' },
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: 'room-1', slug: 'test-room' },
              error: null,
            }),
          }),
        }),
      };
    }
    // room_rolls
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: [] }),
        }),
      }),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });

  return {
    supabase: {
      channel: jest.fn().mockReturnValue(mockChannel),
      from: mockFrom,
      removeChannel: jest.fn(),
    },
    supabaseEnabled: true,
  };
});

import { useRoom } from '../useRoom';

describe('useRoom revealRoll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets shouldAnimate to false when revealing a roll', async () => {
    const { result } = renderHook(() => useRoom());

    // Join a room first
    await act(async () => {
      await result.current.joinRoom('test-room');
    });

    // Add a roll via broadcastRoll
    const roll = {
      id: 1000,
      text: '2d',
      diceCount: 2,
      modifier: 0,
      date: new Date().toISOString(),
      dice: [
        { id: 0, finalNumber: 3, stopAfter: 500, isExploding: false, canExplodeSucceed: false, canExplodeFail: true },
        { id: 1, finalNumber: 5, stopAfter: 600, isExploding: false, canExplodeSucceed: true, canExplodeFail: false },
      ],
    };

    await act(async () => {
      await result.current.broadcastRoll(roll, 'Alice', 'secret');
    });

    // Verify the roll was added with shouldAnimate: true
    expect(result.current.roomRolls).toHaveLength(1);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(true);
    expect(result.current.roomRolls[0].isRevealed).toBe(false);

    // Reveal the roll
    await act(async () => {
      await result.current.revealRoll(1000);
    });

    // After reveal: isRevealed should be true, shouldAnimate should be false
    expect(result.current.roomRolls[0].isRevealed).toBe(true);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(false);
  });
});
