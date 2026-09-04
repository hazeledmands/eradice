import type { NextApiRequest, NextApiResponse } from 'next';
import { checkDatabase } from '../../../lib/db';
import { getIdentityResolver } from '../../../lib/api';

/**
 * Readiness: everything a request actually needs.
 *
 * Two checks, both fail-closed with a 503 so a misconfigured or disconnected
 * pod is pulled from the Service rather than serving errors:
 *
 *   * Identity configuration. A production pod without CLOUDFLARE_ACCESS_*
 *     would answer every request 401; reporting unready instead means a bad
 *     rollout stalls behind maxUnavailable: 0 rather than taking the app down.
 *   * PostgreSQL connectivity, as a real round trip.
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const identity = getIdentityResolver();
  if (!identity.ready) {
    console.error(`readiness failed, component: identity — ${identity.reason}`);
    return res.status(503).json({ status: 'unready', component: 'identity' });
  }

  try {
    await checkDatabase();
  } catch (err) {
    console.error(`readiness failed, component: database — ${(err as Error).message}`);
    return res.status(503).json({ status: 'unready', component: 'database' });
  }

  res.status(200).json({ status: 'ok' });
}
