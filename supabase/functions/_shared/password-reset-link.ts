const LIVE_SITE_URL = "https://vet-dash-suite.lovable.app";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function normalizePublicSiteUrl(siteUrl?: string | null) {
  if (!siteUrl) return null;

  try {
    const url = new URL(siteUrl);
    if (LOCAL_HOSTS.has(url.hostname)) return null;
    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolvePublicSiteUrl(siteUrl = Deno.env.get("SITE_URL")) {
  return normalizePublicSiteUrl(siteUrl) ?? LIVE_SITE_URL;
}

export function getResetPasswordUrl(siteUrl = Deno.env.get("SITE_URL")) {
  return `${resolvePublicSiteUrl(siteUrl)}/reset-password`;
}

export function withCanonicalRedirect(actionLink: string, resetPasswordUrl = getResetPasswordUrl()) {
  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", resetPasswordUrl);
    return url.toString();
  } catch {
    return actionLink;
  }
}