import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let isRefreshing = false;
let consecutiveAuthFailures = 0;
const AUTH_FAILURE_THRESHOLD = 3;

function forceLogout() {
  // Clear all Supabase auth keys from localStorage to break stale state
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-')) localStorage.removeItem(key);
  });
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

const customFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if ((response.status === 401 || response.status === 403) && !isRefreshing) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // Only react to auth/rest endpoints on our Supabase project. Skip storage,
    // realtime, edge functions, and unrelated requests — those can return
    // 401/403 for permission reasons unrelated to the session being invalid.
    const isSupabaseAuthOrRest =
      url.includes(SUPABASE_URL) &&
      (url.includes('/auth/v1/') || url.includes('/rest/v1/'));

    // Never force-logout because the auth endpoint itself returned 401
    // (e.g. a failed token refresh response) — let the SDK handle it.
    const isAuthEndpoint = url.includes('/auth/v1/');

    if (isSupabaseAuthOrRest && !isAuthEndpoint) {
      isRefreshing = true;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
          consecutiveAuthFailures += 1;
          // Only sign the user out after repeated, persistent failures so a
          // single transient 401 (network blip, race with token rotation,
          // realtime hiccup) doesn't kick them out.
          if (consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
            consecutiveAuthFailures = 0;
            await supabase.auth.signOut({ scope: 'local' });
            forceLogout();
          }
        } else {
          consecutiveAuthFailures = 0;
        }
      } catch {
        // Network error during refresh — do NOT log out, just let it retry later.
      } finally {
        isRefreshing = false;
      }
    }
  } else if (response.ok) {
    consecutiveAuthFailures = 0;
  }

  return response;
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: customFetch,
  },
});
