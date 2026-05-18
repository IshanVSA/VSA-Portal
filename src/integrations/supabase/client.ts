import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let isRefreshing = false;

const customFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  // Attempt a silent token refresh on 401s from REST endpoints, but NEVER
  // force the user out from here. A 401 can mean many things (RLS, expired
  // access token, transient network state) and Supabase's SDK already
  // handles real "refresh token invalid" cases through onAuthStateChange.
  // Force-logging out from a fetch interceptor caused team members to be
  // unexpectedly signed out on transient errors.
  if (response.status === 401 && !isRefreshing) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const isSupabaseRest =
      url.includes(SUPABASE_URL) && url.includes('/rest/v1/');

    if (isSupabaseRest) {
      isRefreshing = true;
      try {
        await supabase.auth.refreshSession();
      } catch {
        // Swallow — do not log out. SDK will emit SIGNED_OUT itself if the
        // refresh token is truly invalid.
      } finally {
        isRefreshing = false;
      }
    }
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
