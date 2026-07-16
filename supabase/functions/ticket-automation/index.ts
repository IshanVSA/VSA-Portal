import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization - require CRON_SECRET or admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!(cronSecret && token === cronSecret)) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseCheck = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await supabaseCheck
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results = { autoAssigned: 0, escalated: 0, completed: 0 };

    // ─── 1. AUTO-ASSIGN: Assign unassigned tickets to department leads ───
    const { data: unassigned } = await supabase
      .from("department_tickets")
      .select("id, department")
      .is("assigned_to", null)
      .eq("status", "open");

    if (unassigned && unassigned.length > 0) {
      // Get department leads
      const { data: leads } = await supabase
        .from("department_members")
        .select("user_id, department, department_role")
        .ilike("department_role", "%lead%");

      const leadMap: Record<string, string> = {};
      (leads || []).forEach((l: any) => {
        if (!leadMap[l.department]) leadMap[l.department] = l.user_id;
      });

      for (const ticket of unassigned) {
        const leadId = leadMap[ticket.department];
        if (leadId) {
          await supabase
            .from("department_tickets")
            .update({ assigned_to: leadId, status: "in_progress" as any })
            .eq("id", ticket.id);
          results.autoAssigned++;
        }
      }
    }

    // ─── 2. ESCALATE: Mark overdue tickets (open > 48 BUSINESS hours) as emergency ───
    // Business hours = Mon–Fri 9:00–17:00 (8h/day). Sat/Sun excluded entirely.
    // 48 business hours = 6 business days. We over-fetch by 10 calendar days
    // to catch any ticket that could plausibly cross the threshold, then filter precisely.
    const overfetchCutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { data: overdueCandidates } = await supabase
      .from("department_tickets")
      .select("id, created_at")
      .in("status", ["open", "in_progress"])
      .neq("priority", "emergency")
      .lt("created_at", overfetchCutoff);
    // Note: voided tickets are excluded automatically since status filter only matches open/in_progress.

    const BIZ_START_HOUR = 9;
    const BIZ_END_HOUR = 17;
    const businessMsBetween = (start: Date, end: Date): number => {
      if (end <= start) return 0;
      let total = 0;
      const cursor = new Date(start);
      while (cursor < end) {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) {
          const dayStart = new Date(cursor);
          dayStart.setHours(BIZ_START_HOUR, 0, 0, 0);
          const dayEnd = new Date(cursor);
          dayEnd.setHours(BIZ_END_HOUR, 0, 0, 0);
          const sliceStart = cursor > dayStart ? cursor : dayStart;
          const sliceEnd = end < dayEnd ? end : dayEnd;
          if (sliceEnd > sliceStart) total += sliceEnd.getTime() - sliceStart.getTime();
        }
        cursor.setHours(24, 0, 0, 0);
      }
      return total;
    };
    const THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 business hours
    const now = new Date();
    const overdue = (overdueCandidates || []).filter((t: any) =>
      businessMsBetween(new Date(t.created_at), now) >= THRESHOLD_MS
    );

    if (overdue.length > 0) {
      for (const ticket of overdue) {
        await supabase
          .from("department_tickets")
          .update({ priority: "emergency" as any, notes: "Auto-escalated: ticket open > 48 business hours (Mon–Fri)" })
          .eq("id", ticket.id);
        results.escalated++;
      }
    }


    // ─── 3. NOTIFY: Mark completed tickets (update notes for client visibility) ───
    // Find tickets completed in the last hour that don't have a completion note
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentlyCompleted } = await supabase
      .from("department_tickets")
      .select("id, notes")
      .eq("status", "completed")
      .gte("updated_at", oneHourAgo);

    if (recentlyCompleted) {
      for (const ticket of recentlyCompleted) {
        if (!ticket.notes?.includes("[Completed]")) {
          const newNotes = `${ticket.notes || ""}\n[Completed] Work finished on ${new Date().toISOString().slice(0, 10)}`.trim();
          await supabase
            .from("department_tickets")
            .update({ notes: newNotes })
            .eq("id", ticket.id);
          results.completed++;
        }
      }
    }

    console.log("Ticket automation results:", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Ticket automation error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
