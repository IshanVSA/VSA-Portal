# Goal

Eliminate every known path that can throw a logged-in user (admin, concierge/team, or client) back to `/login` when they actually still have a valid Supabase session in browser storage.

# What's still risky today

The recent fix in `useAuth` handles one race (stale `SIGNED_OUT` after sign-in), but a few paths can still redirect a real user to `/login`:

1. **Initial bootstrap timeout.** If `supabase.auth.getSession()` is slow (GoTrue lock contention across multiple open tabs, a hung service worker, or a flaky network), the 5s safety timer flips `loading=false` with `user=null`. `ProtectedRoute` then runs `<Navigate to="/login" />` even though a valid session token is sitting in `localStorage`.
2. **Transient `SIGNED_OUT` with no recoverable session.** When the SDK fails to refresh once (offline blip, mobile background tab), it emits `SIGNED_OUT` and clears its in-memory session. The current deferred re-check calls `getSession()`, which returns `null` because the SDK just wiped it — so we accept the logout even though storage still has a refresh token that would work on next try.
3. **Cross-tab noise.** Logging out in any tab triggers `SIGNED_OUT` in all tabs. Today we treat all `SIGNED_OUT` events the same. We should only honor logouts that the user actually initiated (via our `signOut()` call), not GoTrue's auto-emitted ones.
4. **Lost destination.** When we do legitimately redirect to `/login`, we don't remember where the user was, so after re-login they land on `/` instead of the page they came from. Not a bug per se, but it's part of "never feel like you got kicked out."

# Plan

### 1. Add a synchronous "has stored session" hint
- Helper `hasStoredSupabaseSession()` that scans `localStorage` for any `sb-*-auth-token` entry with a non-empty `refresh_token` and an `expires_at` parseable as a number. This runs synchronously, no SDK call.
- `AuthProvider` reads this once at mount and stores it as `hasStoredToken` state. Initial `loading` stays `true` until either `getSession()` resolves or the safety timer fires.

### 2. Stop redirecting on bootstrap timeout if a token exists
- In `ProtectedRoute`, change the "no user" branch:
  - `if (!user && hasStoredToken)` → render the existing "Having trouble loading your account" retry panel (same UI as the 8s timeout) instead of `<Navigate to="/login" />`.
  - `if (!user && !hasStoredToken)` → redirect to `/login` (today's behavior), and pass `state={{ from: location }}` so `Login` can send them back after sign-in.
- This guarantees: a user with a valid stored session never silently lands on `/login`; at worst they see a retry screen.

### 3. Only honor user-initiated sign-outs
- Add an `intentionalSignOutRef` in `AuthProvider`. `signOut()` sets it to `true` before calling `supabase.auth.signOut()`.
- In `onAuthStateChange('SIGNED_OUT')`:
  - If `intentionalSignOutRef.current === true` → clear state and reset the ref. Done.
  - Otherwise → keep the existing deferred `getSession()` re-check, AND if it returns `null` but `hasStoredSupabaseSession()` is still true (storage still has a refresh token), **do not** clear `user`. Instead schedule a single `supabase.auth.refreshSession()` attempt; only on its failure do we clear state.
- Add a `BroadcastChannel('vsa-auth')` so an intentional logout in one tab broadcasts to others, which then accept the `SIGNED_OUT` immediately. Storage-only `SIGNED_OUT` events from other tabs are ignored.

### 4. Honor the "where I came from" redirect
- `Login.handleSubmit` reads `location.state?.from?.pathname` and calls `navigate(from ?? "/", { replace: true })` after success.

### 5. Keep the safety nets that already work
- Leave the 5s `AuthProvider` safety timer and 8s `ProtectedRoute` retry UI in place — they still cover the "everything is broken" case.
- Leave `customFetch` 401 handling untouched (it already does a silent refresh and never force-logs out).

# Files to change

- `src/hooks/useAuth.ts` — add `hasStoredToken`, intentional-signout ref, BroadcastChannel, recovery-via-refresh path; expose `hasStoredToken` on the context.
- `src/components/ProtectedRoute.tsx` — branch on `hasStoredToken`, pass `state={{ from }}` to `/login`.
- `src/pages/Login.tsx` — redirect back to `location.state.from` after sign-in.
- `src/lib/auth-storage.ts` (new) — small `hasStoredSupabaseSession()` helper, single source of truth for the storage check.

# Out of scope

No DB / RLS / edge function changes. No UI redesign — only the "trouble loading your account" panel is reused. No change to how roles, departments, or terms-acceptance are loaded.

# Verification

- Hard-reload `/social?clinic=…` as a team member with throttled network → should land on the page, not `/login`.
- Sign out in tab A → tab B redirects to `/login` within ~1s.
- In DevTools, manually `supabase.auth.signOut({ scope: 'local' })` from console (simulates a spurious SIGNED_OUT) while storage still has the token → user stays signed in after one silent refresh.
- Clear all `sb-*` keys from `localStorage` then reload a protected route → redirects to `/login` and after sign-in returns to the original URL (including `?clinic=…`).
