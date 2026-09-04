/**
 * Browser-side wrapper around eradice's own API.
 *
 * Replaces the Supabase client. Cloudflare Access supplies credentials as a
 * cookie on same-origin requests, so there is no token for this module to
 * hold — but `credentials: 'same-origin'` is explicit because an unauthorized
 * response must be distinguishable from a network failure.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The session is gone or was never valid; the page needs a full reload. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(0, 'network_error', (cause as Error).message);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof body.error === 'string' ? body.error : 'server_error',
      typeof body.message === 'string' ? body.message : undefined
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
