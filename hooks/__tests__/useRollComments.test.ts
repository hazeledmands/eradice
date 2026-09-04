import { renderHook, act, waitFor } from '@testing-library/react';
import { FakeServer } from '../../test-utils/server';
import { useRollComments, MAX_INITIAL_COMMENTS } from '../useRollComments';

const ROOM_ID = '11111111-2222-3333-4444-555555555555';
const COMMENTS = `/api/rooms/${ROOM_ID}/comments`;

function comment(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    rollId: 1000,
    text: 'nice roll',
    visibility: 'public' as const,
    authorNickname: 'Alice',
    authorId: 'cf-sub-me',
    createdAt: '2026-09-03T10:00:00.000Z',
    ...over,
  };
}

let server: FakeServer;

function newServer(existing: unknown[] = []) {
  return new FakeServer()
    .on(`GET ${COMMENTS}`, { body: { comments: existing } })
    .on(`POST ${COMMENTS}`, { status: 201, body: { comment: comment() } })
    .on(`PATCH ${COMMENTS}/c1`, { body: { comment: comment({ text: 'edited' }) } })
    .on(`DELETE ${COMMENTS}/c1`, { status: 204 })
    .install();
}

function renderCommentsHook() {
  return renderHook(() =>
    useRollComments({ roomId: ROOM_ID, userId: 'cf-sub-me', nickname: 'Alice' })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('loading', () => {
  it('exports MAX_INITIAL_COMMENTS constant', () => {
    expect(MAX_INITIAL_COMMENTS).toBe(500);
  });

  it('applies a limit to the initial comment fetch', async () => {
    server = newServer();
    renderCommentsHook();

    await waitFor(() => expect(server.callsTo('GET', COMMENTS)).toHaveLength(1));
    expect(server.callsTo('GET', COMMENTS)[0].url).toContain(`limit=${MAX_INITIAL_COMMENTS}`);
  });

  it('groups loaded comments by roll', async () => {
    server = newServer([comment(), comment({ id: 'c2', rollId: 2000, text: 'ouch' })]);
    const { result } = renderCommentsHook();

    await waitFor(() => expect(result.current.commentsByRoll[1000]).toHaveLength(1));
    expect(result.current.commentsByRoll[2000][0].text).toBe('ouch');
  });

  it('fetches nothing when there is no room', async () => {
    server = newServer();
    renderHook(() => useRollComments({ roomId: undefined, nickname: 'Alice' }));

    await Promise.resolve();
    expect(server.callsTo('GET', COMMENTS)).toHaveLength(0);
  });
});

describe('public comments', () => {
  it('posts a public comment and shows it optimistically', async () => {
    server = newServer();
    const { result } = renderCommentsHook();
    await waitFor(() => expect(server.callsTo('GET', COMMENTS)).toHaveLength(1));

    await act(async () => {
      await result.current.addComment(1000, 'nice roll', 'public');
    });

    expect(server.callsTo('POST', COMMENTS)[0].body).toEqual({
      rollId: 1000,
      text: 'nice roll',
      nickname: 'Alice',
    });
    expect(result.current.commentsByRoll[1000]).toHaveLength(1);
  });

  it('rolls the optimistic comment back when the post fails', async () => {
    server = newServer();
    const { result } = renderCommentsHook();
    await waitFor(() => expect(server.callsTo('GET', COMMENTS)).toHaveLength(1));
    server.on(`POST ${COMMENTS}`, { status: 500, body: { error: 'server_error' } });

    await act(async () => {
      await result.current.addComment(1000, 'nice roll', 'public').catch(() => {});
    });

    expect(result.current.commentsByRoll[1000]).toBeUndefined();
  });

  it('edits a comment and restores the old text when the request fails', async () => {
    server = newServer([comment()]);
    const { result } = renderCommentsHook();
    await waitFor(() => expect(result.current.commentsByRoll[1000]).toHaveLength(1));

    await act(async () => {
      await result.current.editComment('c1', 'edited');
    });
    expect(result.current.commentsByRoll[1000][0].text).toBe('edited');

    server.on(`PATCH ${COMMENTS}/c1`, { status: 403, body: { error: 'forbidden' } });
    await act(async () => {
      await result.current.editComment('c1', 'nope').catch(() => {});
    });
    expect(result.current.commentsByRoll[1000][0].text).toBe('edited');
  });

  it('deletes a comment and restores it when the request fails', async () => {
    server = newServer([comment()]);
    const { result } = renderCommentsHook();
    await waitFor(() => expect(result.current.commentsByRoll[1000]).toHaveLength(1));

    server.on(`DELETE ${COMMENTS}/c1`, { status: 403, body: { error: 'forbidden' } });
    await act(async () => {
      await result.current.deleteComment('c1').catch(() => {});
    });
    expect(result.current.commentsByRoll[1000]).toHaveLength(1);

    server.on(`DELETE ${COMMENTS}/c1`, { status: 204 });
    await act(async () => {
      await result.current.deleteComment('c1');
    });
    expect(result.current.commentsByRoll[1000]).toBeUndefined();
  });
});

describe('stream events', () => {
  function relay(detail: unknown) {
    window.dispatchEvent(new CustomEvent('eradice:comment', { detail }));
  }

  it('adds a comment another player posted', async () => {
    server = newServer();
    const { result } = renderCommentsHook();
    await waitFor(() => expect(server.callsTo('GET', COMMENTS)).toHaveLength(1));

    await act(async () => {
      relay({ type: 'comment', comment: comment({ id: 'c9', authorNickname: 'Bob' }) });
    });

    expect(result.current.commentsByRoll[1000][0].authorNickname).toBe('Bob');
  });

  it('does not duplicate a comment it already has', async () => {
    server = newServer([comment()]);
    const { result } = renderCommentsHook();
    await waitFor(() => expect(result.current.commentsByRoll[1000]).toHaveLength(1));

    await act(async () => {
      relay({ type: 'comment', comment: comment({ text: 'nice roll' }) });
    });

    expect(result.current.commentsByRoll[1000]).toHaveLength(1);
  });

  it('applies a remote edit and a remote delete', async () => {
    server = newServer([comment()]);
    const { result } = renderCommentsHook();
    await waitFor(() => expect(result.current.commentsByRoll[1000]).toHaveLength(1));

    await act(async () => {
      relay({ type: 'comment_updated', comment: comment({ text: 'reworded' }) });
    });
    expect(result.current.commentsByRoll[1000][0].text).toBe('reworded');

    await act(async () => {
      relay({ type: 'comment_deleted', id: 'c1' });
    });
    expect(result.current.commentsByRoll[1000]).toBeUndefined();
  });
});

describe('private comments', () => {
  it('keeps a private comment in localStorage and never sends it', async () => {
    server = newServer();
    const { result } = renderCommentsHook();
    await waitFor(() => expect(server.callsTo('GET', COMMENTS)).toHaveLength(1));

    await act(async () => {
      await result.current.addComment(1000, 'my secret note', 'private');
    });

    expect(server.callsTo('POST', COMMENTS)).toHaveLength(0);
    expect(result.current.commentsByRoll[1000][0].visibility).toBe('private');
    expect(localStorage.getItem('eradice-roll-comments')).toContain('my secret note');
  });

  it('stores a solo comment locally even when asked for a public one', async () => {
    server = newServer();
    const { result } = renderHook(() => useRollComments({ roomId: undefined, nickname: 'Alice' }));

    await act(async () => {
      await result.current.addComment(1000, 'solo note', 'public');
    });

    expect(server.callsTo('POST', COMMENTS)).toHaveLength(0);
    expect(result.current.commentsByRoll[1000][0].authorNickname).toBe('You');
  });
});
