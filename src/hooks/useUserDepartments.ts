import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";

export type DepartmentType = "website" | "seo" | "google_ads" | "social_media";

const TEAM_ROLE_TO_DEPARTMENTS: Record<string, DepartmentType[]> = {
  Developer: ["website"],
  Maintenance: ["website"],
  "SEO Lead": ["seo"],
  "Ads Strategist": ["google_ads"],
  "Ads Analyst": ["google_ads"],
  "Social & Concierge": ["social_media"],
  "Meta Ads Specialist": ["social_media"],
};

/**
 * Returns the set of departments the current user belongs to for the purpose
 * of scoping cross-department feeds (notifications, recent activity).
 *
 * - admin → `isAllAccess: true` (no filtering)
 * - client / sub_client → `isAllAccess: true` (these feeds have their own
 *   client-specific filtering; this hook is meant for staff feeds)
 * - concierge → derived from `profiles.team_role`
 */
export function useUserDepartments() {
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole();

  const { data, isLoading } = useQuery({
    queryKey: ["user-departments", user?.id, role],
    queryFn: async (): Promise<DepartmentType[] | null> => {
      if (!user || role !== "concierge") return null;
      const { data } = await supabase
        .from("profiles")
        .select("team_role")
        .eq("id", user.id)
        .maybeSingle();
      const teamRole = (data as any)?.team_role as string | null | undefined;
      if (!teamRole) return [];
      return TEAM_ROLE_TO_DEPARTMENTS[teamRole] ?? [];
    },
    enabled: !!user && !roleLoading && role === "concierge",
    staleTime: 5 * 60 * 1000,
  });

  const isAllAccess = role === "admin" || role === "client";
  const departments = isAllAccess ? null : data ?? null;

  return {
    departments,
    isAllAccess,
    isLoading: roleLoading || (role === "concierge" && isLoading),
  };
}
