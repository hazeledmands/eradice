/**
 * Test doubles for the two browser APIs the hooks now use directly.
 *
 * These replace the hand-built Supabase query-chain mocks. Because the hooks
 * talk to eradice's own HTTP API, a route table keyed by "METHOD /path" is
 * both closer to what actually happens and far less brittle than mirroring a
 * fluent client's shape.
 */

export interface RouteResponse {
  status?: number;
  body?: unknown;
}

type RouteHandler = (init: RequestInit | undefined, url: string) => RouteResponse;

export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readonly url: string;
  readyState = FakeEventSource.CONNECTING;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  static get latest(): FakeEventSource {
    const last = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    if (!last) throw new Error('no EventSource was opened');
    return last;
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Delivers a server event, matching the wire shape the route emits. */
  emit(type: string, data: unknown) {
    this.readyState = FakeEventSource.OPEN;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  emitRaw(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({});
  }
}

export class FakeServer {
  readonly calls: Array<{ method: string; url: string; body: unknown }> = [];
  private routes = new Map<string, RouteHandler>();

  /** `pattern` is "METHOD /path", where a `*` segment matches anything. */
  on(pattern: string, handler: RouteHandler | RouteResponse) {
    this.routes.set(pattern, typeof handler === 'function' ? handler : () => handler);
    return this;
  }

  private match(method: string, path: string): RouteHandler | undefined {
    const exact = this.routes.get(`${method} ${path}`);
    if (exact) return exact;

    for (const [pattern, handler] of this.routes) {
      const [pMethod, pPath] = pattern.split(' ');
      if (pMethod !== method) continue;
      const pSegments = pPath.split('/');
      const aSegments = path.split('/');
      if (pSegments.length !== aSegments.length) continue;
      if (pSegments.every((seg, i) => seg === '*' || seg === aSegments[i])) return handler;
    }
    return undefined;
  }

  readonly fetch = jest.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const path = url.split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, url, body });

    const handler = this.match(method, path);
    const { status = 200, body: responseBody } = handler
      ? handler(init, url)
      : { status: 404, body: { error: 'not_found' } };

    // A hand-rolled response rather than `new Response(...)`: jsdom does not
    // provide the fetch globals, so constructing one throws. This is the only
    // surface lib/apiClient touches.
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (status === 204 ? '' : JSON.stringify(responseBody ?? {})),
    };
  });

  /** Requests made to `path`, ignoring the query string. */
  callsTo(method: string, path: string) {
    return this.calls.filter((c) => c.method === method && c.url.split('?')[0] === path);
  }

  install() {
    global.fetch = this.fetch as unknown as typeof global.fetch;
    (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    FakeEventSource.reset();
    return this;
  }
}
