import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];

const STORAGE_KEY_PREFIX = "dept-chat-last-seen-";

function getStorageKey(department: string, clinicId: string) {
  return `${STORAGE_KEY_PREFIX}${department}-${clinicId}`;
}

export function useDepartmentChatUnread(
  department: DepartmentType,
  clinicId: string | undefined
) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = async () => {
    if (!clinicId || !user) {
      setUnreadCount(0);
      return;
    }

    const lastSeen = localStorage.getItem(getStorageKey(department, clinicId));
    let query = supabase
      .from("department_chats")
      .select("id", { count: "exact", head: true })
      .eq("department", department)
      .eq("clinic_id", clinicId)
      .neq("user_id", user.id);

    if (lastSeen) {
      query = query.gt("created_at", lastSeen);
    }

    const { count } = await query;
    setUnreadCount(count || 0);
  };

  // Initial fetch
  useEffect(() => {
    fetchUnread();
  }, [clinicId, department, user]);

  // Realtime updates
  useEffect(() => {
    if (!clinicId) return;
    const channel = supabase
      .channel(`unread-${department}-${clinicId}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, department, user]);

  const markAsRead = () => {
    if (!clinicId) return;
    localStorage.setItem(getStorageKey(department, clinicId), new Date().toISOString());
    setUnreadCount(0);
  };

  return { unreadCount, markAsRead };
}
