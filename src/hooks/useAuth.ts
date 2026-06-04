import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function forceLogout() {
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) localStorage.removeItem(key);
  });
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Presence heartbeat so admins can see who's actively using the portal.
    // The server keeps last_seen_at fresh without inflating login_count.
    // NOTE: supabase.rpc() returns a lazy PostgrestBuilder — it only fires
    // the HTTP request when .then() is attached (or it is awaited). A bare
    // `supabase.rpc(...)` does nothing, which is why heartbeats were silent.
    const touch = () => {
      try { (supabase as any).rpc("touch_login_activity").then(() => {}, () => {}); } catch {}
    };
    const recordLogin = () => {
      try { (supabase as any).rpc("record_login_activity").then(() => {}, () => {}); } catch {}
    };

    // Recurring heartbeat every 60s while the tab is visible, plus on focus /
    // visibility change so "online" reflects reality within ~1 minute.
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      if (heartbeatTimer) return;
      heartbeatTimer = setInterval(() => {
        if (document.visibilityState === 'visible') touch();
      }, 60_000);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') touch();
    };
    const onFocus = () => touch();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    // 1. Restore session from storage first. This is the single source of
    // truth for initial routing, so protected routes don't redirect while
    // Supabase is still hydrating the browser session after sign-in.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setSession(session);
        setUser(session.user);
        touch();
        startHeartbeat();
      }
      bootstrapped.current = true;
      setLoading(false);
    });

    // 2. Listen for auth changes (sign in/out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          // A stale refresh-token failure can emit SIGNED_OUT immediately after
          // a successful password login. Defer and verify storage before
          // accepting it, so fresh staff sessions are not wiped by an old event.
          setTimeout(() => {
            supabase.auth.getSession().then(({ data: { session: current } }) => {
              if (!mounted) return;
              if (current) {
                setSession(current);
                setUser(current.user);
                touch();
                startHeartbeat();
              } else {
                setSession(null);
                setUser(null);
              }
              bootstrapped.current = true;
              setLoading(false);
            });
          }, 0);
          return;
        }

        if (session) {
          setSession(session);
          setUser(session.user);
          if (event === 'SIGNED_IN') {
            recordLogin();
            startHeartbeat();
          } else if (event === 'TOKEN_REFRESHED') {
            touch();
            startHeartbeat();
          }
        }
        bootstrapped.current = true;
        setLoading(false);
      }
    );

    // 3. Safety timeout – never stay loading for more than 5s
    const timer = setTimeout(() => {
      if (mounted && !bootstrapped.current) {
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const signOut = useCallback(async () => {
    // Fire-and-forget the server signout with a short timeout so a hung/failed
    // network call (e.g. stale refresh token) never blocks the user.
    const serverSignOut = supabase.auth.signOut().catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([serverSignOut, timeout]);

    // Wipe React Query cache so the next user on this browser cannot see
    // any cached PII / clinic data from the previous session.
    try {
      const qc = (window as unknown as { __queryClient?: { clear: () => void } }).__queryClient;
      qc?.clear();
    } catch {}

    // Tell the service worker to drop any cached responses too.
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
    } catch {}

    // Always do a local signout + storage wipe + redirect, regardless of server result.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
    forceLogout();
  }, []);

  const value = useMemo(() => ({ user, session, loading, signOut }), [user, session, loading, signOut]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context) return context;
  throw new Error("useAuth must be used within AuthProvider");
}
