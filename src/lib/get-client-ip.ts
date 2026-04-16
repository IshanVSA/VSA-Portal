let cachedIp: string | null = null;

export async function getClientIp(): Promise<string | null> {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    cachedIp = data.ip ?? null;
    return cachedIp;
  } catch {
    return null;
  }
}
