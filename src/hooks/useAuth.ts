import { createContext, createElement, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AuthError, User, Session } from "@supabase/supabase-js";
import { hasStoredSupabaseSession, clearStoredSupabaseSession } from "@/lib/auth-storage";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * True if localStorage still has a Supabase refresh token. Lets
   * ProtectedRoute show a retry screen instead of redirecting to /login
   * when bootstrap is slow or a transient SIGNED_OUT event arrives.
   */
  hasStoredToken: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const AUTH_CHANNEL = "vsa-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasStoredToken, setHasStoredToken] = useState<boolean>(() => hasStoredSupabaseSession());
  const bootstrapped = useRef(false);
  // Set when *this tab* explicitly initiates a sign-out. Lets us distinguish
  // user-driven logouts from spurious SIGNED_OUT events emitted by the SDK
  // (e.g. transient refresh failures, multi-tab noise).
  const intentionalSignOut = useRef(false);
  // Coalesces concurrent recovery attempts when a spurious SIGNED_OUT fires.
  const recoveryInFlight = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Cross-tab logout signal: only an explicit signOut() in another tab
    // should kick this tab out. Storage-only SIGNED_OUT noise is ignored.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(AUTH_CHANNEL);
      bc.onmessage = (evt) => {
        if (evt?.data?.type === "signout") {
          intentionalSignOut.current = true;
          // Fall through — SDK SIGNED_OUT will arrive from storage event too.
          setUser(null);
          setSession(null);
          setHasStoredToken(false);
        }
      };
    } catch {
      bc = null;
    }

    // Presence heartbeat so admins can see who's actively using the portal.
    const touch = () => {
      try { (supabase as any).rpc("touch_login_activity").then(() => {}, () => {}); } catch {}
    };
    const recordLogin = () => {
      try { (supabase as any).rpc("record_login_activity").then(() => {}, () => {}); } catch {}
    };

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

    const applySession = (s: Session) => {
      setSession(s);
      setUser(s.user);
      setHasStoredToken(true);
    };

    const clearSession = () => {
      setSession(null);
      setUser(null);
      setHasStoredToken(false);
      clearStoredSupabaseSession();
    };

    /**
     * When a SIGNED_OUT event arrives but storage still has a refresh token
     * (typical for transient refresh failures), try a single refresh before
     * clearing state. Only clear if the refresh truly fails.
     */
    const tryRecover = async () => {
      if (recoveryInFlight.current) return;
      recoveryInFlight.current = true;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!mounted) return;
        if (!error && data.session) {
          applySession(data.session);
          touch();
          startHeartbeat();
        } else {
          clearSession();
        }
      } catch {
        if (mounted) clearSession();
      } finally {
        recoveryInFlight.current = false;
        if (mounted) {
          bootstrapped.current = true;
          setLoading(false);
        }
      }
    };

    // 1. Restore session from storage first.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        applySession(session);
        touch();
        startHeartbeat();
      } else {
        // No session in memory. If storage still has a token, attempt recovery
        // instead of falling through to an unauthenticated state.
        if (hasStoredSupabaseSession()) {
          tryRecover();
          return;
        }
        setHasStoredToken(false);
      }
      bootstrapped.current = true;
      setLoading(false);
    }).catch(() => {
      // getSession failed entirely — let the safety timer handle UX.
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          // Honor only user-initiated sign-outs immediately.
          if (intentionalSignOut.current) {
            intentionalSignOut.current = false;
            clearSession();
            bootstrapped.current = true;
            setLoading(false);
            return;
          }

          // Spurious SIGNED_OUT (refresh hiccup, background tab, etc.).
          // Defer: if storage still has a token, try to recover; else clear.
          setTimeout(() => {
            if (!mounted) return;
            supabase.auth.getSession().then(({ data: { session: current } }) => {
              if (!mounted) return;
              if (current) {
                applySession(current);
                touch();
                startHeartbeat();
                bootstrapped.current = true;
                setLoading(false);
              } else if (hasStoredSupabaseSession()) {
                tryRecover();
              } else {
                clearSession();
                bootstrapped.current = true;
                setLoading(false);
              }
            }).catch(() => {
              if (mounted && !hasStoredSupabaseSession()) clearSession();
            });
          }, 0);
          return;
        }

        if (nextSession) {
          applySession(nextSession);
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
      try { bc?.close(); } catch {}
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      setHasStoredToken(true);
      bootstrapped.current = true;
    }
    setLoading(false);
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true;

    // Broadcast to other tabs so they also accept the logout immediately.
    try {
      const bc = new BroadcastChannel(AUTH_CHANNEL);
      bc.postMessage({ type: "signout" });
      bc.close();
    } catch {}

    // Fire-and-forget server signout with a short timeout.
    const serverSignOut = supabase.auth.signOut().catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([serverSignOut, timeout]);

    // Wipe React Query cache so the next user cannot see cached PII.
    try {
      const qc = (window as unknown as { __queryClient?: { clear: () => void } }).__queryClient;
      qc?.clear();
    } catch {}

    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
    } catch {}

    try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
    clearStoredSupabaseSession();
    setUser(null);
    setSession(null);
    setHasStoredToken(false);
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, hasStoredToken, signIn, signOut }),
    [user, session, loading, hasStoredToken, signIn, signOut],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context) return context;
  throw new Error("useAuth must be used within AuthProvider");
}
