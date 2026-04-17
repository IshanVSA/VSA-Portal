import { supabase } from "@/integrations/supabase/client";

const BUCKET = "department-files";

/**
 * When a "Bulk Uploads" ticket is marked completed, move its attachments
 * from `tickets/{id}/...` into the department's Uploads folder so they appear
 * in the Uploads tab. Safe to call multiple times — failures are logged but
 * never thrown to keep the status update flow resilient.
 */
export async function moveBulkUploadsToDepartmentFolder(
  ticketId: string,
  department: string,
): Promise<void> {
  try {
    const { data: ticket, error } = await supabase
      .from("department_tickets" as any)
      .select("attachments, ticket_type, status")
      .eq("id", ticketId)
      .single();

    if (error || !ticket) return;
    const t = ticket as any;
    if (t.ticket_type !== "Bulk Uploads") return;
    const paths: string[] = Array.isArray(t.attachments) ? t.attachments : [];
    if (paths.length === 0) return;

    const movedPaths: string[] = [];
    for (const oldPath of paths) {
      // Already moved (no longer under tickets/)
      if (!oldPath.startsWith("tickets/")) {
        movedPaths.push(oldPath);
        continue;
      }
      const filename = oldPath.split("/").pop() || `file-${crypto.randomUUID()}`;
      const newPath = `${department}/${filename}`;
      const { error: moveError } = await supabase.storage
        .from(BUCKET)
        .move(oldPath, newPath);
      if (moveError) {
        console.error("[bulk-uploads] move failed", oldPath, moveError);
        movedPaths.push(oldPath);
      } else {
        movedPaths.push(newPath);
      }
    }

    await supabase
      .from("department_tickets" as any)
      .update({ attachments: movedPaths } as any)
      .eq("id", ticketId);
  } catch (err) {
    console.error("[bulk-uploads] unexpected error", err);
  }
}
