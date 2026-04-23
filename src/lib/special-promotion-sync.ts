import { supabase } from "@/integrations/supabase/client";

interface ParsedPromotion {
  offer_name: string;
  inclusions: string;
  exclusions: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

const FIELD_RE = /^([A-Za-z ]+):\s*(.*)$/;

function parseDate(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed || /^(N\/A|Ongoing|None)$/i.test(trimmed)) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a Special Promotion ticket description (as produced by SpecialPromotionForm)
 * into structured promotion fields. Returns null when required fields are missing.
 */
export function parseSpecialPromotionDescription(description: string | null | undefined): ParsedPromotion | null {
  if (!description) return null;
  const fields: Record<string, string> = {};
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(FIELD_RE);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }

  const title = fields["title"];
  const desc = fields["description"];
  const startRaw = fields["start date"];
  const endRaw = fields["end date"];
  const notes = fields["additional notes"];

  if (!title || /^N\/A$/i.test(title)) return null;
  const start_date = startRaw ? parseDate(startRaw) : null;
  if (!start_date) return null;
  // End date optional → default to one year out for "Ongoing"
  let end_date = endRaw ? parseDate(endRaw) : null;
  if (!end_date) {
    const dt = new Date(start_date);
    dt.setFullYear(dt.getFullYear() + 1);
    end_date = dt.toISOString().slice(0, 10);
  }

  return {
    offer_name: title,
    inclusions: desc && !/^N\/A$/i.test(desc) ? desc : "",
    exclusions: notes && !/^N\/A$/i.test(notes) ? notes : "",
    start_date,
    end_date,
  };
}

/**
 * When a Special Promotion ticket is marked completed, materialise it as an
 * active row in `clinic_promotions` so the SM department can reference it.
 * Idempotent: if a promotion with the same offer_name + start_date already
 * exists for the clinic, it will not be inserted again.
 */
export async function syncSpecialPromotionFromTicket(args: {
  ticketId: string;
  ticketType: string;
  newStatus: string;
  description: string | null | undefined;
  clinicId: string | null | undefined;
}): Promise<{ inserted: boolean; reason?: string }> {
  const { ticketType, newStatus, description, clinicId } = args;
  if (ticketType !== "Special Promotion") return { inserted: false, reason: "wrong-type" };
  if (newStatus !== "completed") return { inserted: false, reason: "wrong-status" };
  if (!clinicId) return { inserted: false, reason: "no-clinic" };

  const parsed = parseSpecialPromotionDescription(description);
  if (!parsed) return { inserted: false, reason: "unparsable" };

  // De-dupe on (clinic_id, offer_name, start_date)
  const { data: existing } = await supabase
    .from("clinic_promotions")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("offer_name", parsed.offer_name)
    .eq("start_date", parsed.start_date)
    .maybeSingle();
  if (existing) return { inserted: false, reason: "duplicate" };

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("clinic_promotions").insert({
    clinic_id: clinicId,
    offer_name: parsed.offer_name,
    inclusions: parsed.inclusions,
    exclusions: parsed.exclusions,
    start_date: parsed.start_date,
    end_date: parsed.end_date,
    status: "active",
    created_by: user?.id ?? null,
  });
  if (error) return { inserted: false, reason: error.message };
  return { inserted: true };
}
