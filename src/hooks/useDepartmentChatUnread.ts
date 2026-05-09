import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];

export function useDepartmentChatUnread(
  department: DepartmentType,
  clinicId: string | undefined
) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!clinicId || !user) {
      setUnreadCount(0);
      return;
    }

    // Get the user's last-read timestamp from the server-side receipts table
    const { data: receipt } = await supabase
      .from("department_chat_reads" as any)
      .select("last_read_at")
      .eq("user_id", user.id)
      .eq("department", department)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const lastReadAt = (receipt as any)?.last_read_at as string | undefined;

    let query = supabase
      .from("department_chats")
      .select("id", { count: "exact", head: true })
      .eq("department", department)
      .eq("clinic_id", clinicId)
      .neq("user_id", user.id);

    if (lastReadAt) {
      query = query.gt("created_at", lastReadAt);
    }

    const { count } = await query;
    setUnreadCount(count || 0);
  }, [clinicId, department, user]);

  // Initial fetch
  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Realtime updates: new messages OR my own read receipt updating
  useEffect(() => {
    if (!clinicId || !user) return;
    const channel = supabase
      .channel(`clinic:${clinicId}:unread:${department}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "department_chats",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => fetchUnread()
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "department_chats",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => fetchUnread()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "department_chat_reads",
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { user_id?: string; department?: string } | null;
          if (row?.user_id === user.id && row?.department === department) {
            fetchUnread();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, department, user, fetchUnread]);

  const markAsRead = useCallback(async () => {
    if (!clinicId || !user) return;
    setUnreadCount(0);

    // Find the latest message id to record as last_read_message_id
    const { data: latest } = await supabase
      .from("department_chats")
      .select("id")
      .eq("department", department)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload: any = {
      user_id: user.id,
      department,
      clinic_id: clinicId,
      last_read_message_id: latest?.id ?? null,
      last_read_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("department_chat_reads" as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("department", department)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("department_chat_reads" as any)
        .update({
          last_read_message_id: payload.last_read_message_id,
          last_read_at: payload.last_read_at,
        } as any)
        .eq("user_id", user.id)
        .eq("department", department)
        .eq("clinic_id", clinicId);
    } else {
      await supabase.from("department_chat_reads" as any).insert(payload);
    }
  }, [clinicId, department, user]);

  return { unreadCount, markAsRead };
}
