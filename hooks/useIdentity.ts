import { useState, useEffect } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';

interface Identity {
  userId: string | null;
  isReady: boolean;
}

export function useIdentity(): Identity {
  const [identity, setIdentity] = useState<Identity>({
    userId: null,
    isReady: !supabaseEnabled,
  });

  useEffect(() => {
    if (!supabase || !supabaseEnabled) return;

    let cancelled = false;

    async function init() {
      if (!supabase) return;
      // Check for existing session first (reads from localStorage cache — fast)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (!cancelled) setIdentity({ userId: session.user.id, isReady: true });
        return;
      }
      // No session — sign in anonymously
      try {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (!cancelled) {
          if (error || !data.user) {
            // Anonymous auth not enabled or failed — degrade gracefully
            setIdentity({ userId: null, isReady: true });
          } else {
            setIdentity({ userId: data.user.id, isReady: true });
          }
        }
      } catch {
        if (!cancelled) setIdentity({ userId: null, isReady: true });
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setIdentity({ userId: session?.user?.id ?? null, isReady: true });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return identity;
}
