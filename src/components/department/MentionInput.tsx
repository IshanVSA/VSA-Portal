import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];

interface MentionUser {
  id: string;
  name: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  department: DepartmentType;
  clinicId: string | undefined;
  disabled?: boolean;
  placeholder?: string;
}

const DEPARTMENT_TEAM_ROLES: Record<string, string[]> = {
  website: ["Developer", "Maintenance"],
  seo: ["SEO Lead"],
  google_ads: ["Ads Strategist", "Ads Analyst"],
  social_media: ["Social & Concierge", "Meta Ads Specialist"],
};

export function useMentionableUsers(department: DepartmentType, clinicId: string | undefined) {
  return useQuery({
    queryKey: ["mentionable-users", department, clinicId],
    queryFn: async (): Promise<MentionUser[]> => {
      if (!clinicId) return [];

      // Legacy: explicit department_members rows (if any exist)
      const { data: deptMembers } = await supabase
        .from("department_members")
        .select("user_id")
        .eq("department", department);

      // Staff with a team_role mapped to this department, assigned to this clinic
      const allowedRoles = DEPARTMENT_TEAM_ROLES[department] || [];
      let deptStaffIds: string[] = [];
      if (allowedRoles.length > 0) {
        const { data: roleProfiles } = await supabase
          .from("profiles")
          .select("id, team_role")
          .in("team_role", allowedRoles);
        const candidateIds = (roleProfiles || []).map((p) => p.id);
        if (candidateIds.length > 0) {
          const { data: assignments } = await (supabase
            .from("clinic_team_members" as any)
            .select("user_id")
            .eq("clinic_id", clinicId)
            .in("user_id", candidateIds) as any);
          const assigned = new Set(
            ((assignments || []) as { user_id: string }[]).map((a) => a.user_id)
          );
          deptStaffIds = candidateIds.filter((id) => assigned.has(id));
        }
      }

      // Admins (always mentionable)
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const userIds = [
        ...new Set([
          ...(deptMembers || []).map((m) => m.user_id),
          ...deptStaffIds,
          ...(adminRoles || []).map((r) => r.user_id),
        ]),
      ];

      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      return (profiles || []).map((p) => ({
        id: p.id,
        name: p.full_name || "Unknown",
      }));
    },
    enabled: !!clinicId,
    staleTime: 60000,
  });
}

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  department,
  clinicId,
  disabled,
  placeholder,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: users = [] } = useMentionableUsers(department, clinicId);

  const filtered = mentionQuery
    ? users.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : users;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      onChange(val);

      const cursor = e.target.selectionStart || 0;
      // Find the last @ before cursor that isn't preceded by a non-space char
      const textBeforeCursor = val.slice(0, cursor);
      const atMatch = textBeforeCursor.match(/(^|[\s])@([^\s]*)$/);
      if (atMatch) {
        setShowDropdown(true);
        setMentionQuery(atMatch[2]);
        setMentionStartIdx(cursor - atMatch[2].length - 1); // position of @
        setSelectedIdx(0);
      } else {
        setShowDropdown(false);
        setMentionQuery("");
      }
    },
    [onChange]
  );

  const insertMention = useCallback(
    (user: MentionUser) => {
      const before = value.slice(0, mentionStartIdx);
      const after = value.slice(mentionStartIdx + mentionQuery.length + 1); // +1 for @
      const newVal = `${before}@${user.name} ${after}`;
      onChange(newVal);
      setShowDropdown(false);
      setMentionQuery("");
      setTimeout(() => {
        if (textareaRef.current) {
          const pos = before.length + user.name.length + 2; // @ + name + space
          textareaRef.current.selectionStart = pos;
          textareaRef.current.selectionEnd = pos;
          textareaRef.current.focus();
        }
      }, 0);
    },
    [value, mentionStartIdx, mentionQuery, onChange]
  );

  const handleKeyDownInternal = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown && filtered.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIdx((prev) => (prev + 1) % filtered.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIdx((prev) => (prev - 1 + filtered.length) % filtered.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(filtered[selectedIdx]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }
      onKeyDown(e);
    },
    [showDropdown, filtered, selectedIdx, insertMention, onKeyDown]
  );

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "0";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 80) + "px";
    }
  }, [value]);

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownInternal}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className={cn(
          "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 resize-none h-9 min-h-[36px] max-h-[80px]"
        )}
      />
      {showDropdown && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-20 overflow-hidden"
        >
          <div className="py-1 max-h-[160px] overflow-y-auto">
            {filtered.map((user, idx) => (
              <button
                key={user.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors",
                  idx === selectedIdx
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted text-foreground"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user);
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                  {user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </span>
                <span className="truncate">{user.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render message text with @mentions highlighted */
export function renderMessageWithMentions(text: string, searchQuery?: string) {
  // Split by @mention pattern (word characters, spaces within a name)
  const mentionRegex = /@([\w][\w\s]*?)(?=\s@|\s[^@]|$)/g;
  const parts: { type: "text" | "mention"; value: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "mention", value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (parts.length === 0) parts.push({ type: "text", value: text });

  return (
    <>
      {parts.map((part, i) =>
        part.type === "mention" ? (
          <span key={i} className="font-semibold text-primary">
            {part.value}
          </span>
        ) : searchQuery?.trim() ? (
          <HighlightedText key={i} text={part.value} query={searchQuery} />
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
