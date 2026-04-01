

## Auto-Recovery from Stale Sessions

### Problem
When a user's session becomes stale (e.g., server-side session was revoked/expired but client still holds old tokens), API calls fail with 401/403 "session not found" errors, requiring manual logout/login.

### Solution
Two complementary fixes to make session recovery fully automatic:

### 1. Global Auth Error Interceptor (`useAuth.ts`)
Listen for the `TOKEN_REFRESHED` and `SIGNED_OUT` events, but more critically, handle the case where `getSession()` returns a session with tokens that are actually invalid server-side.

Add logic to `useAuth.ts`:
- Listen for the `onAuthStateChange` event `TOKEN_REFRESH_FAILED` — when Supabase can't refresh the token, automatically call `signOut()` to clear stale local storage and redirect to `/login`.
- This covers the scenario where the refresh token itself is expired or revoked.

### 2. Global Supabase Fetch Interceptor (`client.ts`)
Add a custom `global.fetch` wrapper to the Supabase client config that intercepts 401/403 responses from any Supabase API call (including edge functions). When detected:
- Attempt `supabase.auth.refreshSession()` 
- If refresh fails, auto-sign-out and redirect to `/login`
- If refresh succeeds, the SDK will automatically retry with the new token on subsequent calls

### Changes

**File: `src/integrations/supabase/client.ts`**
- Add a custom `fetch` wrapper in the `global` config that catches 401/403 from Supabase endpoints, triggers a session refresh, and if that fails, clears the session and redirects to `/login`.

**File: `src/hooks/useAuth.ts`**  
- Add handling for `TOKEN_REFRESHED` failure scenario — if `onAuthStateChange` fires with event `TOKEN_REFRESHED` but session is null, or if a `SIGNED_OUT` event fires unexpectedly, navigate to login.
- Specifically handle the case where `getSession()` succeeds but the session is actually stale by wrapping the initial check with a `getUser()` validation call — if `getUser()` returns an auth error, sign out automatically.

### How It Works
```text
API call → 401/403 response
  ↓
Custom fetch intercepts
  ↓
Tries refreshSession()
  ├─ Success → next call uses fresh token
  └─ Failure → signOut() + redirect to /login
```

This ensures users never see a broken state — stale sessions are silently refreshed or cleanly logged out without any manual intervention.

