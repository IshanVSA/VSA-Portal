import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";

/**
 * Returns true if the current user should see financial data
 * (spend, cost, CPC, budgets). Sub-accounts whose parent client toggled
 * "hide_financials" will get false.
 */
export function useFinancialsVisible(): { visible: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole();

  const { data, isLoading } = useQuery({
    queryKey: ["sub-account-hide-financials", user?.id],
    enabled: !!user && role === "sub_client",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase
        .from("client_sub_accounts" as any)
        .select("hide_financials")
        .eq("sub_user_id", user!.id)
        .maybeSingle() as any);
      return !!data?.hide_financials;
    },
  });

  if (roleLoading) return { visible: true, isLoading: true };
  if (role !== "sub_client") return { visible: true, isLoading: false };
  return { visible: !data, isLoading };
}
