import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  name: string;
  role: string;
  teamRole: string | null;
}

const departmentRoleMap: Record<string, string[]> = {
  website: ["Developer", "Maintenance"],
  seo: ["SEO Lead"],
  google_ads: ["Ads Strategist", "Ads Analyst"],
  social_media: ["Social & Concierge", "Meta Ads Specialist"],
};

export function useDepartmentTeam(department: string, clinicId?: string): { team: TeamMember[]; loading: boolean } {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      const allowedRoles = departmentRoleMap[department] || [];
      if (allowedRoles.length === 0) {
        setTeam([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, team_role")
        .in("team_role", allowedRoles);

      if (!profiles || profiles.length === 0) {
        setTeam([]);
        setLoading(false);
        return;
      }

      // Exclude client-role users
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const clientIds = new Set(
        (roles || []).filter((r) => r.role === "client").map((r) => r.user_id)
      );

      // Build a map of user_id -> highest-priority app role for display
      const rolePriority: Record<string, number> = { admin: 3, concierge: 2, client: 1 };
      const appRoleByUser = new Map<string, string>();
      (roles || []).forEach((r) => {
        const current = appRoleByUser.get(r.user_id);
        if (!current || (rolePriority[r.role] || 0) > (rolePriority[current] || 0)) {
          appRoleByUser.set(r.user_id, r.role);
        }
      });
      const roleLabel = (r?: string) => {
        if (r === "admin") return "Admin";
        if (r === "concierge") return "Member";
        if (r === "client") return "Client";
        return "Member";
      };

      let staffProfiles = profiles.filter((p) => !clientIds.has(p.id));

      // Filter by clinic assignment if clinicId is provided
      if (clinicId) {
        const { data: assignments } = await (supabase
          .from("clinic_team_members" as any)
          .select("user_id")
          .eq("clinic_id", clinicId) as any);

        const assignedUserIds = new Set(
          ((assignments || []) as { user_id: string }[]).map((a) => a.user_id)
        );
        staffProfiles = staffProfiles.filter((p) => assignedUserIds.has(p.id));
      }

      setTeam(
        staffProfiles.map((p) => ({
          name: p.full_name || p.email || "Unknown",
          role: roleLabel(appRoleByUser.get(p.id)),
          teamRole: p.team_role,
        }))
      );
      setLoading(false);
    };

    fetchTeam();
  }, [department, clinicId]);

  return { team, loading };
}
