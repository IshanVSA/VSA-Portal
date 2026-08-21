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
const failed = new Set<string>();
const MAX_MINT_ATTEMPTS = 2;
const attempts = new Map<string, number>();

/**
 * The opaque `/f/:token` path only resolves where the hosting rewrite exists
 * (the production domain). In Lovable preview/localhost that path returns the
 * SPA shell, which breaks <img> tags, so we address the resolver directly there.
 */
const hasRewrite = () => {
  const h = window.location.hostname;
  return !(
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith("lovable.app") ||
    h.endsWith("lovableproject.com")
  );
};

const previewMediaUrl = (path: string) =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export const shortLinkUrl = (token: string) => {
  if (hasRewrite()) return `${window.location.origin}/f/${token}`;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/media-link/${token}`;
};

const openShortLinkUrl = (token: string) => {
  const encoded = encodeURIComponent(token);
  if (hasRewrite()) return `${window.location.origin}/f/${encoded}`;

  // Lovable preview and localhost do not run the Vercel rewrite. Open the
  // same opaque token through the resolver directly instead of sending the
  // browser to the SPA shell at /f/:token.
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/media-link/${encoded}`;
};

export const departmentFilePath = (value: string) => {
  const marker = "/storage/v1/object/public/department-files/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return value;

  const encodedPath = value.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

async function mint(paths: string[]) {
  const missing = paths.filter(
    (p) => p && !cache.has(p) && !inflight.has(p) && (attempts.get(p) ?? 0) < MAX_MINT_ATTEMPTS,
  );
  if (missing.length === 0) return;

  for (const path of missing) attempts.set(path, (attempts.get(path) ?? 0) + 1);

  const promise = (async () => {
    const { data, error } = await (supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: { object_path: string; token: string }[] | null; error: unknown }>;
    }).rpc("mint_short_links", { _paths: missing, _bucket: BUCKET });

    if (!error && data) {
      for (const row of data) {
        cache.set(row.object_path, row.token);
        failed.delete(row.object_path);
      }
      for (const path of missing) {
        if (!cache.has(path)) failed.add(path);
      }
    } else {
      for (const path of missing) failed.add(path);
      console.error("Unable to create opaque media links", error);
    }
  })().finally(() => {
    for (const p of missing) inflight.delete(p);
  });

  for (const p of missing) inflight.set(p, promise);
  await promise;
}

export function useShortLinks(paths: (string | null | undefined)[]) {
  const clean = useMemo(
    () => Array.from(new Set(
      paths
        .filter((p): p is string => !!p)
        .map(departmentFilePath),
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths.filter(Boolean).join("|")],
  );
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (clean.some((p) => !cache.has(p))) {
      void mint(clean).then(() => {
        if (!cancelled) setRevision((value) => value + 1);
      });
    }
    return () => { cancelled = true; };
  }, [clean]);

  return useMemo(() => {
    const resolve = (path: string) => {
      const objectPath = departmentFilePath(path);
      const token = cache.get(objectPath);
      if (token) return shortLinkUrl(token);

      // Preview hosts do not support the production /f/:token rewrite. Keep
      // media visible there even if token minting is unavailable or delayed.
      // This URL is only used as an embedded asset source; production still
      // exclusively exposes the opaque first-party URL.
      return hasRewrite() ? "" : previewMediaUrl(objectPath);
    };
    const resolveOpen = (path: string) => {
      const objectPath = departmentFilePath(path);
      const token = cache.get(objectPath);
      // Preview can still open the asset if token creation is temporarily
      // unavailable. Production never exposes the raw storage URL.
      if (token) return openShortLinkUrl(token);
      return hasRewrite() ? "" : previewMediaUrl(objectPath);
    };
    return {
      resolve,
      resolveOpen,
      ready: !hasRewrite() || clean.every((p) => cache.has(p) || failed.has(p)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clean, revision]);
}
