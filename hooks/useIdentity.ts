import { useState, useEffect } from 'react';
import { api, ApiError } from '../lib/apiClient';

/**
 * The signed-in user's id.
 *
 * Was Supabase anonymous auth, which minted a UUID per browser and kept it in
 * localStorage — so the same person on a second device was a different user.
 * It is now the Cloudflare Access subject, which is stable across devices and
 * browsers, and is established before the request ever reaches the app.
 *
 * There is no sign-in flow to run here as a result: Access has already
 * happened by the time this code executes, so this only reads back who the
 * server says we are.
 */
interface Identity {
  userId: string | null;
  isReady: boolean;
}

export function useIdentity(): Identity {
  const [identity, setIdentity] = useState<Identity>({ userId: null, isReady: false });

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ userId: string }>('/api/me')
      .then(({ userId }) => {
        if (!cancelled) setIdentity({ userId, isReady: true });
      })
      .catch((err: ApiError) => {
        // Degrade the same way the Supabase version did rather than blocking
        // the UI: solo rolling still works without an identity. A 401 here
        // means the Access session lapsed, and the next mutation surfaces it.
        if (!cancelled) setIdentity({ userId: null, isReady: true });
        if (!(err instanceof ApiError) || !err.isUnauthorized) {
          console.error(`could not load identity: ${err.message}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return identity;
}
