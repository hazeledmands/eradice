import { renderHook, act, waitFor } from '@testing-library/react';
import { FakeServer, FakeEventSource } from '../../test-utils/server';
import { useRoom } from '../useRoom';

const ROOM = { id: '11111111-2222-3333-4444-555555555555', slug: 'test-room' };
const ME = 'cf-sub-me';

function roll(id = 1000) {
  return {
    id,
    text: '2d',
    diceCount: 2,
    modifier: 0,
    date: new Date(id).toISOString(),
    dice: [
      { id: 0, finalNumber: 3, stopAfter: 500, isExploding: false },
      { id: 1, finalNumber: 5, stopAfter: 600, isExploding: false },
    ],
  };
}

/** A roll as the stream delivers it. */
function streamed(id: number, over: Record<string, unknown> = {}) {
  return {
    ...roll(id),
    nickname: 'Bob',
    isLocal: false,
    shouldAnimate: true,
    visibility: 'shared',
    isRevealed: false,
    _cursor: String(id),
    ...over,
  };
}

let server: FakeServer;

function newServer(rolls: unknown[] = []) {
  return new FakeServer()
    .on('GET /api/me', { body: { userId: ME, name: 'Me' } })
    .on('POST /api/rooms', { body: { room: ROOM } })
    .on(`GET /api/rooms/${ROOM.id}/rolls`, { body: { rolls, hasMore: false } })
    .on(`POST /api/rooms/${ROOM.id}/rolls`, { status: 201, body: { roll: streamed(1000) } })
    .on(`POST /api/rooms/${ROOM.id}/rolls/1000/reveal`, { body: {} })
    .on(`POST /api/rooms/${ROOM.id}/rolls/1000/cp`, { body: {} })
    .on(`POST /api/rooms/${ROOM.id}/presence`, { body: { presence: [] } })
    .on(`DELETE /api/rooms/${ROOM.id}/presence`, { status: 204 })
    .install();
}

/** Joins a room and waits until the stream is open. */
async function joinedRoom(rolls: unknown[] = []) {
  server = newServer(rolls);
  const hook = renderHook(() => useRoom());
  await act(async () => {
    await hook.result.current.joinRoom('test-room');
  });
  await act(async () => {
    FakeEventSource.latest.emitRaw('ready');
  });
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  FakeEventSource.reset();
});

describe('joining', () => {
  it('creates or joins the room, loads history, and opens one stream', async () => {
    const { result } = await joinedRoom([streamed(900, { _cursor: '900' })]);

    expect(server.callsTo('POST', '/api/rooms')[0].body).toEqual({ slug: 'test-room' });
    expect(result.current.room).toEqual(ROOM);
    expect(result.current.roomRolls).toHaveLength(1);
    expect(result.current.isConnected).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.latest.url).toContain(`/api/rooms/${ROOM.id}/stream`);
  });

  it('reports a friendly error when the session has expired', async () => {
    server = new FakeServer()
      .on('GET /api/me', { body: { userId: ME } })
      .on('POST /api/rooms', { status: 401, body: { error: 'unauthorized' } })
      .install();

    const { result } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom('test-room');
    });

    expect(result.current.error).toMatch(/expired/i);
    expect(result.current.room).toBeNull();
  });

  it('closes the stream when leaving', async () => {
    const { result } = await joinedRoom();
    const source = FakeEventSource.latest;

    await act(async () => {
      result.current.leaveRoom();
    });

    expect(source.readyState).toBe(FakeEventSource.CLOSED);
    expect(result.current.room).toBeNull();
    expect(result.current.roomRolls).toEqual([]);
  });
});

describe('revealRoll', () => {
  it('sets shouldAnimate to false when revealing a roll', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      await result.current.broadcastRoll(roll(), 'Alice', 'secret');
    });

    expect(result.current.roomRolls).toHaveLength(1);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(true);
    expect(result.current.roomRolls[0].isRevealed).toBe(false);

    await act(async () => {
      await result.current.revealRoll(1000);
    });

    expect(result.current.roomRolls[0].isRevealed).toBe(true);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(false);
  });

  it('restores the hidden state when the reveal request fails', async () => {
    const { result } = await joinedRoom();
    await act(async () => {
      await result.current.broadcastRoll(roll(), 'Alice', 'secret');
    });

    server.on(`POST /api/rooms/${ROOM.id}/rolls/1000/reveal`, {
      status: 403,
      body: { error: 'forbidden' },
    });

    await act(async () => {
      await result.current.revealRoll(1000).catch(() => {});
    });

    expect(result.current.roomRolls[0].isRevealed).toBe(false);
  });
});

describe('broadcastRoll', () => {
  it('shows the roll optimistically before the server responds', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      await result.current.broadcastRoll(roll(), 'Alice');
    });

    expect(result.current.roomRolls[0]).toMatchObject({
      id: 1000,
      nickname: 'Alice',
      isLocal: true,
      shouldAnimate: true,
    });
    expect(server.callsTo('POST', `/api/rooms/${ROOM.id}/rolls`)).toHaveLength(1);
  });

  it('removes the optimistic roll and reports an error when the post fails', async () => {
    const { result } = await joinedRoom();
    server.on(`POST /api/rooms/${ROOM.id}/rolls`, { status: 500, body: { error: 'server_error' } });

    await act(async () => {
      await result.current.broadcastRoll(roll(), 'Alice').catch(() => {});
    });

    expect(result.current.roomRolls).toEqual([]);
    expect(result.current.error).toMatch(/could not be shared/i);
  });
});

describe('stream events', () => {
  it('appends another player\'s roll and animates it', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      FakeEventSource.latest.emit('roll', streamed(2000));
    });

    expect(result.current.roomRolls).toHaveLength(1);
    expect(result.current.roomRolls[0]).toMatchObject({
      id: 2000,
      nickname: 'Bob',
      isLocal: false,
      shouldAnimate: true,
    });
  });

  it('ignores the echo of a roll already shown optimistically', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      await result.current.broadcastRoll(roll(), 'Alice');
    });
    await act(async () => {
      FakeEventSource.latest.emit('roll', streamed(1000, { isLocal: true }));
    });

    expect(result.current.roomRolls).toHaveLength(1);
  });

  it('applies a remote reveal without restarting the animation', async () => {
    const { result } = await joinedRoom();
    await act(async () => {
      FakeEventSource.latest.emit('roll', streamed(2000));
    });

    await act(async () => {
      FakeEventSource.latest.emit('roll_updated', streamed(2000, { isRevealed: true }));
    });

    expect(result.current.roomRolls[0].isRevealed).toBe(true);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(false);
  });

  it('animates a remote CP spend, which adds dice', async () => {
    const { result } = await joinedRoom();
    await act(async () => {
      FakeEventSource.latest.emit('roll', streamed(2000));
    });

    const withCpDie = streamed(2000);
    withCpDie.dice = [...withCpDie.dice, { id: 2, finalNumber: 6, stopAfter: 700, isExploding: false }];

    await act(async () => {
      FakeEventSource.latest.emit('roll_updated', withCpDie);
    });

    expect(result.current.roomRolls[0].dice).toHaveLength(3);
    expect(result.current.roomRolls[0].shouldAnimate).toBe(true);
  });

  it('tracks who is in the room', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      FakeEventSource.latest.emit('presence', [
        { nickname: 'Alice', online_at: '2026-09-03T10:00:00.000Z' },
        { nickname: 'Bob', online_at: '2026-09-03T10:00:01.000Z' },
      ]);
    });

    expect(result.current.presenceUsers.map((u) => u.nickname)).toEqual(['Alice', 'Bob']);
  });

  it('relays comment events for useRollComments rather than opening a second stream', async () => {
    await joinedRoom();
    const received: unknown[] = [];
    window.addEventListener('eradice:comment', (e) => received.push((e as CustomEvent).detail));

    await act(async () => {
      FakeEventSource.latest.emit('comment', { id: 'c1', text: 'nice' });
      FakeEventSource.latest.emit('comment_deleted', { id: 'c1' });
    });

    expect(received).toEqual([
      { type: 'comment', comment: { id: 'c1', text: 'nice' } },
      { type: 'comment_deleted', id: 'c1' },
    ]);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('marks itself disconnected while the browser is retrying', async () => {
    const { result } = await joinedRoom();

    await act(async () => {
      FakeEventSource.latest.readyState = FakeEventSource.CONNECTING;
      FakeEventSource.latest.emitRaw('error');
    });

    expect(result.current.isConnected).toBe(false);
    // Still retrying, so this is not surfaced to the user as a failure.
    expect(result.current.error).toBeNull();
  });
});

describe('identity', () => {
  it('marks a roll as local when the server says it is ours', async () => {
    const { result } = await joinedRoom([streamed(900, { isLocal: true, _cursor: '900' })]);
    await waitFor(() => expect(result.current.identityReady).toBe(true));
    expect(result.current.userId).toBe(ME);
    expect(result.current.roomRolls[0].isLocal).toBe(true);
  });
});
