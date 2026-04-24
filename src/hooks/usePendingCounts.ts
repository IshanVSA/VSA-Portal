import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Aggregates "actionable for me" counts across the platform so badges can
 * cascade from the sidebar (top-level) all the way down to per-tab badges.
 *
 * - pendingRequests / pendingReview: legacy `content_requests` workflow
 * - socialPending: NEW SM2 workflow (`sm2_generations`)
 *     • client → generations sent for copy or final review (action required)
 *     • concierge/admin → generations where the client requested changes,
 *       OR client approved copy and visuals are now needed
 */
export function usePendingCounts() {
  const { role } = useUserRole();
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingReview, setPendingReview] = useState(0);
  const [socialPending, setSocialPending] = useState(0);

  useEffect(() => {
    if (!role) return;

    const fetchCounts = async () => {
      // ── Legacy content_requests workflow ──────────────────────────
      if (role === "admin") {
        const { count: reqCount } = await supabase
          .from("content_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "concierge_preferred");
        setPendingRequests(reqCount || 0);

        const { count: revCount } = await supabase
          .from("content_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "client_selected");
        setPendingReview(revCount || 0);
      } else if (role === "concierge") {
        const { count: reqCount } = await supabase
          .from("content_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "generated");
        setPendingRequests(reqCount || 0);
      } else if (role === "client") {
        const { count: reqCount } = await supabase
          .from("content_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "admin_approved");
        setPendingRequests(reqCount || 0);
      }

      // ── SM2 workflow (sm2_generations) ────────────────────────────
      if (role === "client") {
        // Client owes a response when copy or final has been sent for review.
        const { count } = await supabase
          .from("sm2_generations")
          .select("*", { count: "exact", head: true })
          .in("approval_status", ["sent_for_copy_review", "sent_for_final_review"]);
        setSocialPending(count || 0);
      } else if (role === "concierge" || role === "admin") {
        // Staff owes a response when:
        //  • client approved copy → visuals needed
        //  • client requested copy or final changes → revisions needed
        const { count } = await supabase
          .from("sm2_generations")
          .select("*", { count: "exact", head: true })
          .in("approval_status", [
            "copy_approved",
            "copy_changes_requested",
            "final_changes_requested",
          ]);
        setSocialPending(count || 0);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);

    const channel = supabase
      .channel("pending-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_requests" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "sm2_generations" }, fetchCounts)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [role]);

  return { pendingRequests, pendingReview, socialPending };
}
