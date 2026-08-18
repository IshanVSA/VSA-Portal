import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Maps storage object paths to opaque short links (`/f/<token>`), so media that
 * users open in a new tab never exposes the raw Supabase storage URL.
 *
 * Never exposes the public storage URL. Media remains unavailable for the
 * brief moment while its opaque token is being minted.
 */

const BUCKET = "department-files";
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

export const shortLinkUrl = (token: string) =>
  `${window.location.origin}/f/${token}`;

async function mint(paths: string[]) {
  const missing = paths.filter((p) => p && !cache.has(p) && !inflight.has(p));
  if (missing.length === 0) return;

  const promise = (async () => {
    const { data, error } = await (supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: { object_path: string; token: string }[] | null; error: unknown }>;
    }).rpc("mint_short_links", { _paths: missing, _bucket: BUCKET });

    if (!error && data) {
      for (const row of data) cache.set(row.object_path, row.token);
    }
  })().finally(() => {
    for (const p of missing) inflight.delete(p);
  });

  for (const p of missing) inflight.set(p, promise);
  await promise;
}

export function useShortLinks(paths: (string | null | undefined)[]) {
  const clean = useMemo(
    () => Array.from(new Set(paths.filter((p): p is string => !!p))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths.filter(Boolean).join("|")],
  );
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (clean.some((p) => !cache.has(p))) {
      void mint(clean).then(() => { if (!cancelled) force((n) => n + 1); });
    }
    return () => { cancelled = true; };
  }, [clean]);

  return useMemo(() => {
    const resolve = (path: string) => {
      const token = cache.get(path);
      return token ? shortLinkUrl(token) : "";
    };
    return { resolve, ready: clean.every((p) => cache.has(p)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, clean.map((p) => cache.get(p) ?? "").join("|")]);
}
