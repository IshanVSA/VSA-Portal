/**
 * Shared helpers for resolving and formatting user display names.
 *
 * Rules:
 * - Trim outer whitespace and collapse internal runs of whitespace into single spaces.
 * - Prefer `profile.full_name` over auth `user_metadata.full_name`.
 * - Fall back to the local part of the email, then a friendly default.
 *
 * Always show the FULL name — never split on the first space.
 */

export function formatDisplayName(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

interface UserLike {
  email?: string | null;
  user_metadata?: Record<string, any> | null;
}

/**
 * Resolve the best available display name for a user.
 * @param profileName  full_name from the `profiles` table (preferred)
 * @param user         auth user (used for metadata + email fallback)
 * @param fallback     value when nothing else is available
 */
export function resolveDisplayName(
  profileName?: string | null,
  user?: UserLike | null,
  fallback = "there",
): string {
  const fromProfile = formatDisplayName(profileName);
  if (fromProfile) return fromProfile;

  const fromMeta = formatDisplayName(user?.user_metadata?.full_name);
  if (fromMeta) return fromMeta;

  const email = user?.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }

  return fallback;
}
