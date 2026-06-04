/**
 * Synchronously detect whether Supabase has a session token in localStorage.
 *
 * Used by AuthProvider / ProtectedRoute to avoid bouncing a logged-in user
 * back to /login during transient SDK glitches (slow getSession, spurious
 * SIGNED_OUT events, refresh-token race conditions). If a usable refresh
 * token is still on disk, we should try to recover instead of redirecting.
 */
export function hasStoredSupabaseSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0) {
          return true;
        }
      } catch {
        // Some SDK versions store a bare string token
        if (raw.length > 20) return true;
      }
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — treat as no token
  }
  return false;
}

/** Remove every Supabase auth token entry from localStorage. */
export function clearStoredSupabaseSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}
