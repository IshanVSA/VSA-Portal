import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";

export function useAiSeoAccess(clinicId?: string) {
  const { user } = useAuth();
  const { role } = useUserRole();

  const { data: enabled, isLoading } = useQuery({
    queryKey: ["ai-seo-access", clinicId, user?.id],
    queryFn: async () => {
      if (!user) return false;

      // Admins can always access disabled clinics for setup/debugging
      if (role === "admin") return true;

      // For everyone else, check the clinic-level AI SEO flag
      let targetClinicId = clinicId;
      if (!targetClinicId) {
        // RLS scopes to owned + partner clinics for clients.
        const { data: clinic } = await supabase
          .from("clinics")
          .select("id, ai_seo_enabled")
          .limit(1)
          .maybeSingle();
        return clinic?.ai_seo_enabled ?? false;
      }

      const { data } = await supabase
        .from("clinics")
        .select("ai_seo_enabled")
        .eq("id", targetClinicId)
        .maybeSingle();
      return (data as any)?.ai_seo_enabled ?? false;
    },
    enabled: !!user && !!role,
  });

  return { hasAccess: enabled ?? false, isLoading };
}
