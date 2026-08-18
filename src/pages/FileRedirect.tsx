import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

/**
 * Fallback for environments without the `/f/:token` hosting rewrite. It fetches
 * the resolver response without navigating away, keeping the opaque `/f/` URL
 * visible in the browser even in the Lovable preview.
 */
export default function FileRedirect() {
  const { token } = useParams<{ token: string }>();
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!base) {
      setFailed(true);
      return;
    }

    let objectUrl = "";
    let cancelled = false;
    void fetch(`${base}/functions/v1/media-link/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!response.ok) throw new Error("File not found");
        return Promise.all([response.blob(), response.headers.get("content-type") ?? "application/octet-stream"]);
      })
      .then(([blob, type]) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ url: objectUrl, type });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  if (failed) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">File not found.</div>;
  }

  if (file?.type.startsWith("image/")) {
    return <main className="flex min-h-screen items-center justify-center bg-background p-4"><img src={file.url} alt="Shared media" className="max-h-[calc(100vh-2rem)] max-w-full object-contain" /></main>;
  }

  if (file?.type.startsWith("video/")) {
    return <main className="flex min-h-screen items-center justify-center bg-background p-4"><video src={file.url} controls autoPlay className="max-h-[calc(100vh-2rem)] max-w-full" /></main>;
  }

  if (file) {
    return <iframe src={file.url} title="Shared file" className="h-screen w-full border-0" />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
