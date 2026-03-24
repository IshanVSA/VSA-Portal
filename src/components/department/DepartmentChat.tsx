import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Paperclip, X, FileText, Image as ImageIcon, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];

interface Props {
  department: DepartmentType;
  clinicId: string | undefined;
}

interface FileAttachment {
  name: string;
  path: string;
  type: string;
  size: number;
}

interface ChatMessage {
  id: string;
  message: string;
  created_at: string;
  user_id: string;
  sender_name?: string;
  attachments?: FileAttachment[];
}

function getDateLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const TYPING_TIMEOUT = 3000;

export function DepartmentChat({ department, clinicId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; timeout: NodeJS.Timeout }>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);

  const queryKey = ["department-chats", department, clinicId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("department_chats")
        .select("id, message, created_at, user_id, attachments")
        .eq("department", department)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;

      const userIds = [...new Set((data || []).map((m) => m.user_id))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        profileMap = Object.fromEntries(
          (profiles || []).map((p) => [p.id, p.full_name || "Unknown"])
        );
      }

      return (data || []).map((m) => ({
        ...m,
        sender_name: profileMap[m.user_id] || "Unknown",
        attachments: (m.attachments as unknown as FileAttachment[] | null) || [],
      })) as ChatMessage[];
    },
    enabled: !!clinicId,
  });

  const { data: ownProfile } = useQuery({
    queryKey: ["own-profile-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return data?.full_name || "Someone";
    },
    enabled: !!user,
    staleTime: Infinity,
  });

  // Realtime: DB changes + typing broadcast
  useEffect(() => {
    if (!clinicId || !user) return;

    const channelName = `dept-chat-${department}-${clinicId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "department_chats",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id === user.id) return;
        setTypingUsers((prev) => {
          if (prev[payload.user_id]) {
            clearTimeout(prev[payload.user_id].timeout);
          }
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const next = { ...p };
              delete next[payload.user_id];
              return next;
            });
          }, TYPING_TIMEOUT);
          return {
            ...prev,
            [payload.user_id]: { name: payload.name, timeout },
          };
        });
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      setTypingUsers((prev) => {
        Object.values(prev).forEach((v) => clearTimeout(v.timeout));
        return {};
      });
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [clinicId, department, user, queryClient]);

  const broadcastTyping = useCallback(() => {
    if (!typingChannelRef.current || !user || !ownProfile) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: user.id, name: ownProfile },
    });
  }, [user, ownProfile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const uploadFiles = async (files: File[]): Promise<FileAttachment[]> => {
    const uploaded: FileAttachment[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `chat/${department}/${clinicId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("department-files")
        .upload(storagePath, file);
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }
      uploaded.push({
        name: file.name,
        path: storagePath,
        type: file.type,
        size: file.size,
      });
    }
    return uploaded;
  };

  const handleSend = async () => {
    const hasMessage = newMessage.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if ((!hasMessage && !hasFiles) || !clinicId || !user) return;

    setSending(true);
    try {
      let attachments: FileAttachment[] = [];
      if (hasFiles) {
        attachments = await uploadFiles(pendingFiles);
      }

      await supabase.from("department_chats").insert({
        department,
        clinic_id: clinicId,
        user_id: user.id,
        message: newMessage.trim() || (attachments.length > 0 ? `Sent ${attachments.length} file${attachments.length > 1 ? "s" : ""}` : ""),
        attachments: attachments as any,
      });
      setNewMessage("");
      setPendingFiles([]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (e.target.value.trim()) broadcastTyping();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });

    setPendingFiles((prev) => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES);
      if (prev.length + valid.length > MAX_FILES) {
        toast.warning(`Maximum ${MAX_FILES} files per message`);
      }
      return combined;
    });

    // Reset input so re-selecting same file works
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("department-files")
      .createSignedUrl(path, 300);
    return data?.signedUrl;
  };

  const handleDownload = async (attachment: FileAttachment) => {
    const url = await getSignedUrl(attachment.path);
    if (url) {
      window.open(url, "_blank");
    } else {
      toast.error("Failed to get download link");
    }
  };

  if (!clinicId) return null;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const typingNames = Object.values(typingUsers).map((v) => v.name);
  const typingText =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length === 2
      ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : typingNames.length > 2
      ? `${typingNames[0]} and ${typingNames.length - 1} others are typing…`
      : null;

  return (
    <Card className="border-border/60 mt-4">
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">Team Chat</h3>
        <span className="text-xs text-muted-foreground ml-auto">Internal only</span>
      </div>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-4 py-3" ref={scrollRef as any}>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-48 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              <p>No messages yet</p>
              <p className="text-xs">Start the conversation</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, idx) => {
                const msgDate = new Date(msg.created_at);
                const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;
                const showDateSeparator = !prevDate || !isSameDay(msgDate, prevDate);
                const isOwn = msg.user_id === user?.id;
                const attachments = msg.attachments || [];

                return (
                  <div key={msg.id}>
                    {showDateSeparator && (
                      <div className="flex items-center gap-3 my-3">
                        <div className="flex-1 h-px bg-border/50" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {getDateLabel(msgDate)}
                        </span>
                        <div className="flex-1 h-px bg-border/50" />
                      </div>
                    )}
                    <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] bg-muted">
                          {getInitials(msg.sender_name || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[75%] ${isOwn ? "text-right" : ""}`}>
                        <div className={`flex items-baseline gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
                          <span className="text-xs font-medium text-foreground">
                            {isOwn ? "You" : msg.sender_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(msgDate, "h:mm a")}
                          </span>
                        </div>
                        {msg.message && (
                          <div
                            className={`inline-block px-3 py-1.5 rounded-xl text-sm ${
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted text-foreground rounded-tl-sm"
                            }`}
                          >
                            {msg.message}
                          </div>
                        )}
                        {attachments.length > 0 && (
                          <div className={`flex flex-col gap-1.5 mt-1 ${isOwn ? "items-end" : "items-start"}`}>
                            {attachments.map((att, i) => (
                              <AttachmentPreview key={i} attachment={att} onDownload={handleDownload} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Typing indicator */}
        <div className="h-5 px-4">
          {typingText && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-in fade-in duration-200">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
              </span>
              {typingText}
            </div>
          )}
        </div>

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="px-3 pb-1 flex flex-wrap gap-1.5">
            {pendingFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1 text-xs text-foreground"
              >
                {isImageType(file.type) ? (
                  <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                <button
                  onClick={() => removePendingFile(i)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 p-3 border-t border-border/40">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="h-9 w-9 p-0 shrink-0"
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={sending}
            className="text-sm h-9"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending}
            className="h-9 px-3"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Attachment preview sub-component
function AttachmentPreview({
  attachment,
  onDownload,
}: {
  attachment: FileAttachment;
  onDownload: (att: FileAttachment) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = isImageType(attachment.type);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("department-files")
        .createSignedUrl(attachment.path, 300);
      if (!cancelled && data?.signedUrl) setPreviewUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [attachment.path, isImage]);

  if (isImage && previewUrl) {
    return (
      <button
        onClick={() => onDownload(attachment)}
        className="group relative rounded-lg overflow-hidden border border-border/50 max-w-[200px]"
      >
        <img
          src={previewUrl}
          alt={attachment.name}
          className="max-h-[140px] w-auto object-cover rounded-lg"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Download className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onDownload(attachment)}
      className="flex items-center gap-2 bg-muted hover:bg-muted/80 transition-colors rounded-lg px-3 py-2 text-xs text-foreground"
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="text-left min-w-0">
        <p className="truncate max-w-[150px] font-medium">{attachment.name}</p>
        <p className="text-muted-foreground">{formatFileSize(attachment.size)}</p>
      </div>
      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
    </button>
  );
}
