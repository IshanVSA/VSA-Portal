export function normalizeClinicWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Website URL must use http or https");
  }

  url.hash = "";
  return url.toString();
}

export function isHttpsClinicWebsiteUrl(input: string): boolean {
  return input.trim().startsWith("https://");
}