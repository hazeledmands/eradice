import { route } from '../../lib/api';

/**
 * The signed-in identity, replacing supabase.auth.getSession().
 *
 * `sub` is the Cloudflare Access subject and the ownership key used throughout
 * — it is what `isLocal` compares against. Email is deliberately not returned:
 * nothing in the UI shows it, and shared history should not carry it.
 */
export default route({
  GET: async ({ res, identity }) => {
    res.status(200).json({ userId: identity.sub, name: identity.name ?? null });
  },
});
