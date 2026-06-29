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

const roleLabel = (r?: string | null) => {
  if (r === "admin") return "Admin";
  if (r === "concierge") return "Member";
  if (r === "client") return "Client";
  return "Member";
};

export function useDepartmentTeam(department: string, clinicId?: string): { team: TeamMember[]; loading: boolean } {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      const allowedRoles = departmentRoleMap[department] || [];
      if (allowedRoles.length === 0 || !clinicId) {
        setTeam([]);
        setLoading(false);
        return;
      }

      // Use a security-definer RPC so clients (not just staff) can see who is
      // assigned to their clinic for this department, without exposing emails.
      const { data, error } = await (supabase.rpc as any)("get_clinic_department_team", {
        _clinic_id: clinicId,
        _team_roles: allowedRoles,
      });

      if (error || !data) {
        setTeam([]);
        setLoading(false);
        return;
      }

      setTeam(
        (data as Array<{ full_name: string; team_role: string | null; app_role: string }>).map((row) => ({
          name: row.full_name || "Member",
          role: roleLabel(row.app_role),
          teamRole: row.team_role,
        }))
      );
      setLoading(false);
    };

    fetchTeam();
  }, [department, clinicId]);

  return { team, loading };
}
