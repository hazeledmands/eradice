import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Liveness only: is the process running and able to answer? Deliberately does
 * NOT touch the database — a liveness probe that fails during a CNPG failover
 * would restart every pod at exactly the moment the database is recovering.
 * That is readiness' job.
 *
 * Not wrapped in `route()`: kubelet probes the internal Service directly and
 * carries no Access assertion.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok' });
}
