import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useTermsAcceptance() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["terms-acceptance", user?.id],
    queryFn: async () => {
      if (!user) return { hasAccepted: false, currentVersion: null };

      const { data: accepted, error } = await supabase.rpc(
        "has_accepted_current_terms",
        { p_user_id: user.id }
      );
      if (error) throw error;

      const { data: version } = await supabase
        .from("terms_versions")
        .select("version")
        .eq("is_active", true)
        .maybeSingle();

      return {
        hasAccepted: !!accepted,
        currentVersion: version?.version ?? null,
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    hasAccepted: data?.hasAccepted ?? false,
    currentVersion: data?.currentVersion ?? null,
    isLoading,
  };
}
