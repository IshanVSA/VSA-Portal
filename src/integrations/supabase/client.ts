import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let isRefreshing = false;

const customFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if ((response.status === 401 || response.status === 403) && !isRefreshing) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    
    if (url.includes(SUPABASE_URL)) {
      isRefreshing = true;
      try {
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          await supabase.auth.signOut();
          window.location.href = '/login';
        }
      } catch {
        await supabase.auth.signOut();
        window.location.href = '/login';
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
