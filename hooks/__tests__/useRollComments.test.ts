import { renderHook } from '@testing-library/react';
import { MAX_INITIAL_COMMENTS } from '../useRollComments';

// Build a mock supabase that records the query chain
const mockOrder = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();
const mockThen = jest.fn().mockImplementation((cb: (result: { data: null }) => void) => {
  cb({ data: null });
  return Promise.resolve();
});

// Make the chain: .from().select().eq().order().limit().then()
const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

// Assign .limit() -> .then() and .order() -> .limit()
mockOrder.mockReturnValue({ limit: mockLimit });
mockLimit.mockReturnValue({ then: mockThen });

const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: () => mockChannel,
    removeChannel: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      signInAnonymously: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
  supabaseEnabled: true,
}));

// Import after mock
import { useRollComments } from '../useRollComments';

describe('useRollComments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-setup chain after clear
    mockOrder.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ then: mockThen });
    mockEq.mockReturnValue({ order: mockOrder });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it('exports MAX_INITIAL_COMMENTS constant', () => {
    expect(MAX_INITIAL_COMMENTS).toBe(500);
  });

  it('applies a limit to the initial comment fetch', () => {
    renderHook(() => useRollComments({ roomId: 'room-1', userId: 'user-1', nickname: 'Alice' }));

    expect(mockFrom).toHaveBeenCalledWith('roll_comments');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(mockLimit).toHaveBeenCalledWith(MAX_INITIAL_COMMENTS);
  });
});
