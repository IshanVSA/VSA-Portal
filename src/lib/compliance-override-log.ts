import { supabase } from "@/integrations/supabase/client";

export interface ComplianceOverrideEntry {
  context: "Promotion" | "Pop-up Offer" | string;
  clinicId?: string | null;
  offerName?: string | null;
  complianceBody?: string | null;
  issues: string[];
  overrideReason: string;
  metadata?: Record<string, unknown>;
}

export async function logComplianceOverride(entry: ComplianceOverrideEntry) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("compliance_override_log").insert({
      user_id: user.id,
      clinic_id: entry.clinicId ?? null,
      context: entry.context,
      offer_name: entry.offerName ?? null,
      compliance_body: entry.complianceBody ?? null,
      issues: entry.issues ?? [],
      override_reason: entry.overrideReason,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error("Compliance override log failed:", error);
  } catch (err) {
    console.error("Compliance override log exception:", err);
  }
}
