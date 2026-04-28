import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "concierge" | "client" | "sub_client";

/**
 * Returns the user's effective role for UI purposes.
 *
 * IMPORTANT: `sub_client` users are intentionally normalized to `"client"` so
 * they get the exact same UI/permissions as their parent client (create
 * tickets, approve content, etc). Sub-account-specific behavior (hide
 * financials, hide the Sub Accounts page) should use `isSubAccount` instead.
 *
 * `rawRole` returns the unmodified DB role when truly needed.
 */
export function useUserRole() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole) ?? "client";
    },
    enabled: !!user,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const rawRole = (data ?? null) as AppRole | null;
  const isSubAccount = rawRole === "sub_client";
  // Normalize sub_client → client so all client-side gates apply.
  const role: AppRole | null = isSubAccount ? "client" : rawRole;

  return { role, rawRole, isSubAccount, isLoading };
}
