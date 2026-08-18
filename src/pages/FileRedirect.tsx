import { useEffect } from "react";
import { useParams } from "react-router-dom";

/**
 * Fallback for environments without the `/f/:token` hosting rewrite (e.g. the
 * Lovable preview). Production traffic is proxied straight to the resolver, so
 * this component never renders there.
 */
export default function FileRedirect() {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    if (!token) return;
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (base) window.location.replace(`${base}/functions/v1/media-link/${token}`);
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
