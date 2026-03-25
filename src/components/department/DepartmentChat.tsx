import { useCallback, useEffect, useRef, useState, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Paperclip, X, FileText, Image as ImageIcon, Download, Search, Reply, CornerDownRight, Pin, PinOff, Check, CheckCheck, Trash2 } from "lucide-react";
import { EmojiPicker } from "./EmojiPicker";
import { MessageReactions } from "./MessageReactions";
import { MentionInput, renderMessageWithMentions } from "./MentionInput";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRole } from "@/hooks/useUserRole";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type DepartmentType = Database["public"]["Enums"]["department_type"];

interface Props {
  department: DepartmentType;
  clinicId: string | undefined;
  onVisible?: () => void;
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
  reactions?: Record<string, string[]>;
  reply_to?: string | null;
  reply_preview?: { sender_name: string; message: string } | null;
  pinned?: boolean;
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const TYPING_TIMEOUT = 3000;

export function DepartmentChat({ department, clinicId, onVisible }: Props) {
  const { user } = useAuth();
  const { role } = useUserRole();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // Find the ScrollArea viewport
      const viewport = node.querySelector("[data-radix-scroll-area-viewport]");
      (scrollRef as any).current = viewport || node;
    }
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; timeout: NodeJS.Timeout }>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mark as read when visible
  useEffect(() => {
    onVisible?.();
  }, [onVisible]);

  const queryKey = ["department-chats", department, clinicId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("department_chats")
        .select("id, message, created_at, user_id, attachments, reactions, reply_to, pinned")
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

      const mapped = (data || []).map((m) => ({
        ...m,
        sender_name: profileMap[m.user_id] || "Unknown",
        attachments: (m.attachments as unknown as FileAttachment[] | null) || [],
        reactions: (m.reactions as unknown as Record<string, string[]> | null) || {},
        reply_to: (m as any).reply_to as string | null,
        reply_preview: null as { sender_name: string; message: string } | null,
        pinned: (m as any).pinned as boolean || false,
      }));

      // Build reply previews
      const msgMap = new Map(mapped.map((m) => [m.id, m]));
      for (const m of mapped) {
        if (m.reply_to && msgMap.has(m.reply_to)) {
          const parent = msgMap.get(m.reply_to)!;
          m.reply_preview = { sender_name: parent.sender_name, message: parent.message };
        }
      }

      return mapped as ChatMessage[];
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

  // Read receipts - fetch all readers for this dept+clinic
  const readReceiptsKey = ["department-chat-reads", department, clinicId];
  const { data: readReceipts = [] } = useQuery({
    queryKey: readReceiptsKey,
    queryFn: async () => {
      if (!clinicId) return [];
      const { data } = await supabase
        .from("department_chat_reads" as any)
        .select("user_id, last_read_message_id, last_read_at")
        .eq("department", department)
        .eq("clinic_id", clinicId);
      return (data || []) as unknown as { user_id: string; last_read_message_id: string | null; last_read_at: string }[];
    },
    enabled: !!clinicId,
  });

  // Mark messages as read when viewing
  const markAsRead = useCallback(async () => {
    if (!clinicId || !user || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    const myReceipt = readReceipts.find((r) => r.user_id === user.id);
    if (myReceipt?.last_read_message_id === lastMsg.id) return;

    if (myReceipt) {
      await supabase
        .from("department_chat_reads" as any)
        .update({ last_read_message_id: lastMsg.id, last_read_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .eq("department", department)
        .eq("clinic_id", clinicId);
    } else {
      await supabase.from("department_chat_reads" as any).insert({
        user_id: user.id,
        department,
        clinic_id: clinicId,
        last_read_message_id: lastMsg.id,
      } as any);
    }
    queryClient.invalidateQueries({ queryKey: readReceiptsKey });
  }, [clinicId, user, messages, readReceipts, department, queryClient]);

  useEffect(() => {
    markAsRead();
  }, [messages, markAsRead]);

  // Filtered messages for search
  const filteredMessages = searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.sender_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.attachments || []).some((a) =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : messages;

  // Realtime
  useEffect(() => {
    if (!clinicId || !user) return;
    const channel = supabase
      .channel(`dept-chat-${department}-${clinicId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "department_chats", filter: `clinic_id=eq.${clinicId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
          onVisible?.();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "department_chats", filter: `clinic_id=eq.${clinicId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id === user.id) return;
        setTypingUsers((prev) => {
          if (prev[payload.user_id]) clearTimeout(prev[payload.user_id].timeout);
          const timeout = setTimeout(() => {
            setTypingUsers((p) => { const next = { ...p }; delete next[payload.user_id]; return next; });
          }, TYPING_TIMEOUT);
          return { ...prev, [payload.user_id]: { name: payload.name, timeout } };
        });
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      setTypingUsers((prev) => { Object.values(prev).forEach((v) => clearTimeout(v.timeout)); return {}; });
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [clinicId, department, user, queryClient]);

  const broadcastTyping = useCallback(() => {
    if (!typingChannelRef.current || !user || !ownProfile) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { user_id: user.id, name: ownProfile } });
  }, [user, ownProfile]);

  useEffect(() => {
    if (scrollRef.current && !searchQuery) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, searchQuery]);

  // --- Drag & Drop ---
  const addFiles = (files: File[]) => {
    const valid = files.filter((f) => {
      if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name} exceeds 10MB limit`); return false; }
      return true;
    });
    setPendingFiles((prev) => {
      const combined = [...prev, ...valid].slice(0, MAX_FILES);
      if (prev.length + valid.length > MAX_FILES) toast.warning(`Maximum ${MAX_FILES} files per message`);
      return combined;
    });
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) addFiles(droppedFiles);
  };

  const uploadFiles = async (files: File[]): Promise<FileAttachment[]> => {
    const uploaded: FileAttachment[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `chat/${department}/${clinicId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("department-files").upload(storagePath, file);
      if (error) { toast.error(`Failed to upload ${file.name}`); continue; }
      uploaded.push({ name: file.name, path: storagePath, type: file.type, size: file.size });
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
      if (hasFiles) attachments = await uploadFiles(pendingFiles);
      await supabase.from("department_chats").insert({
        department, clinic_id: clinicId, user_id: user.id,
        message: newMessage.trim() || (attachments.length > 0 ? `Sent ${attachments.length} file${attachments.length > 1 ? "s" : ""}` : ""),
        attachments: attachments as any,
        reply_to: replyTo?.id || null,
      } as any);
      setNewMessage("");
      setPendingFiles([]);
      setReplyTo(null);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInputChange = (val: string) => {
    setNewMessage(val);
    if (val.trim()) broadcastTyping();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => setPendingFiles((prev) => prev.filter((_, i) => i !== index));

  const handleDownload = async (attachment: FileAttachment) => {
    const { data } = await supabase.storage.from("department-files").createSignedUrl(attachment.path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Failed to get download link");
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const users = reactions[emoji] ? [...reactions[emoji]] : [];
    const idx = users.indexOf(user.id);
    if (idx >= 0) users.splice(idx, 1);
    else users.push(user.id);
    if (users.length === 0) delete reactions[emoji];
    else reactions[emoji] = users;
    await supabase.from("department_chats").update({ reactions: reactions as any }).eq("id", messageId);
    queryClient.invalidateQueries({ queryKey });
  };

  const handleEmojiInsert = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
  };

   const handleTogglePin = async (messageId: string, currentlyPinned: boolean) => {
    await supabase.from("department_chats").update({ pinned: !currentlyPinned } as any).eq("id", messageId);
    queryClient.invalidateQueries({ queryKey });
  };

  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);

  const confirmDeleteMessage = async () => {
    if (!deleteMessageId) return;
    const { error } = await supabase.from("department_chats").delete().eq("id", deleteMessageId);
    if (error) {
      toast.error("Failed to delete message");
    } else {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Message deleted");
    }
    setDeleteMessageId(null);
  };

  // Build a map of which messages have been read by whom
  const getReadByForMessage = (messageId: string): string[] => {
    if (!user) return [];
    // Find all read receipts where last_read_message_id >= this message
    // Since we order by created_at asc, we can compare by checking if the read receipt's
    // last_read_message is this message or comes after it
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return [];
    
    return readReceipts
      .filter((r) => {
        if (r.user_id === user.id) return false; // Don't show self
        const readMsgIdx = messages.findIndex((m) => m.id === r.last_read_message_id);
        return readMsgIdx >= msgIndex;
      })
      .map((r) => r.user_id);
  };

  if (!clinicId) return null;

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const typingNames = Object.values(typingUsers).map((v) => v.name);
  const typingText =
    typingNames.length === 1 ? `${typingNames[0]} is typing…`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
    : typingNames.length > 2 ? `${typingNames[0]} and ${typingNames.length - 1} others are typing…`
    : null;

  const pinnedMessages = messages.filter((m) => m.pinned);
  const displayMessages = searchQuery.trim() ? filteredMessages : messages;

  // Build profile map for read receipt names
  const profilesMap = new Map(messages.map((m) => [m.user_id, m.sender_name || "Unknown"]));

  return (
    <Card
      className={`border-border/60 relative transition-colors ${isDragging ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg border-2 border-dashed border-primary/50">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Paperclip className="h-8 w-8" />
            <p className="text-sm font-medium">Drop files here</p>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">Team Chat</h3>
        <div className="ml-auto flex items-center gap-1">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="h-7 w-48 text-xs"
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
          <span className="text-xs text-muted-foreground">Internal only</span>
        </div>
      </div>

      <CardContent className="p-0">
        {/* Pinned messages bar */}
        {pinnedMessages.length > 0 && !searchQuery.trim() && (
          <div className="px-4 py-2 bg-accent/30 border-b border-border/40">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1">
              <Pin className="h-3 w-3 text-primary" />
              <span>Pinned ({pinnedMessages.length})</span>
            </div>
            <div className="space-y-1">
              {pinnedMessages.slice(0, 3).map((pm) => (
                <div key={pm.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{pm.sender_name}:</span>
                  <span className="truncate">{pm.message.slice(0, 80)}{pm.message.length > 80 ? "…" : ""}</span>
                  <button
                    onClick={() => handleTogglePin(pm.id, true)}
                    className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                    title="Unpin"
                  >
                    <PinOff className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchQuery.trim() && (
          <div className="px-4 py-1.5 bg-muted/30 border-b border-border/30 text-xs text-muted-foreground">
            {filteredMessages.length} result{filteredMessages.length !== 1 ? "s" : ""} for "{searchQuery}"
          </div>
        )}

        <ScrollArea className="h-[300px] px-4 py-3" ref={scrollContainerRef}>
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
          ) : displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
              {searchQuery.trim() ? (
                <p>No messages matching your search</p>
              ) : (
                <>
                  <p>No messages yet</p>
                  <p className="text-xs">Start the conversation</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {displayMessages.map((msg, idx) => {
                const msgDate = new Date(msg.created_at);
                const prevDate = idx > 0 ? new Date(displayMessages[idx - 1].created_at) : null;
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
                    {msg.pinned && (
                      <div className="flex items-center gap-1 text-[10px] text-primary mb-0.5">
                        <Pin className="h-2.5 w-2.5" />
                        <span>Pinned</span>
                      </div>
                    )}
                    <div className={`flex gap-2 group/msg ${isOwn ? "flex-row-reverse" : ""}`}>
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
                          <span className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1">
                            <button
                              onClick={() => setReplyTo(msg)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Reply"
                            >
                              <Reply className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleTogglePin(msg.id, !!msg.pinned)}
                              className="text-muted-foreground hover:text-foreground"
                              title={msg.pinned ? "Unpin" : "Pin"}
                            >
                              {msg.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                            </button>
                            {role === "admin" && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="Delete message"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        </div>
                        {/* Reply preview */}
                        {msg.reply_preview && (
                          <div className={`flex items-start gap-1.5 mb-1 ${isOwn ? "justify-end" : ""}`}>
                            <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-0.5 max-w-[200px] truncate border-l-2 border-primary/40">
                              <span className="font-medium">{msg.reply_preview.sender_name}:</span>{" "}
                              {msg.reply_preview.message.slice(0, 60)}{msg.reply_preview.message.length > 60 ? "…" : ""}
                            </div>
                          </div>
                        )}
                        {msg.message && (
                          <div
                            className={`inline-block px-3 py-1.5 rounded-xl text-sm whitespace-pre-wrap break-words ${
                              isOwn
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted text-foreground rounded-tl-sm"
                            }`}
                          >
                            {renderMessageWithMentions(msg.message, searchQuery.trim() ? searchQuery : undefined)}
                          </div>
                        )}
                        {attachments.length > 0 && (
                          <div className={`flex flex-col gap-1.5 mt-1 ${isOwn ? "items-end" : "items-start"}`}>
                            {attachments.map((att, i) => (
                              <AttachmentPreview key={i} attachment={att} onDownload={handleDownload} />
                            ))}
                          </div>
                        )}
                        <MessageReactions
                          reactions={msg.reactions || {}}
                          currentUserId={user?.id || ""}
                          onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                          isOwn={isOwn}
                        />
                        {/* Read receipts - show on own messages */}
                        {isOwn && (() => {
                          const readers = getReadByForMessage(msg.id);
                          if (readers.length === 0) return (
                            <div className={`flex items-center gap-0.5 mt-0.5 ${isOwn ? "justify-end" : ""}`}>
                              <Check className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                          );
                          return (
                            <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : ""}`}>
                              <CheckCheck className="h-3 w-3 text-primary" />
                              <span className="text-[10px] text-muted-foreground">
                                {readers.length === 1
                                  ? `Seen by ${profilesMap.get(readers[0]) || "1 person"}`
                                  : `Seen by ${readers.length}`}
                              </span>
                            </div>
                          );
                        })()}
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
              <div key={i} className="flex items-center gap-1.5 bg-muted rounded-lg px-2 py-1 text-xs text-foreground">
                {isImageType(file.type) ? (
                  <ImageIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                <button onClick={() => removePendingFile(i)} className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/40 bg-muted/20">
            <Reply className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Replying to <span className="font-medium text-foreground">{replyTo.sender_name}</span>: {replyTo.message.slice(0, 50)}{replyTo.message.length > 50 ? "…" : ""}
            </span>
            <button onClick={() => setReplyTo(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex gap-2 p-3 border-t border-border/40">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={sending} className="h-9 w-9 p-0 shrink-0">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <EmojiPicker onSelect={handleEmojiInsert} side="top" align="start" />
          <MentionInput
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            department={department}
            clinicId={clinicId}
            disabled={sending}
            placeholder="Type a message... Use @ to mention"
          />
          <Button size="sm" onClick={handleSend} disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending} className="h-9 px-3">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}




// Attachment preview sub-component
function AttachmentPreview({ attachment, onDownload }: { attachment: FileAttachment; onDownload: (att: FileAttachment) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = isImageType(attachment.type);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("department-files").createSignedUrl(attachment.path, 300);
      if (!cancelled && data?.signedUrl) setPreviewUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [attachment.path, isImage]);

  if (isImage && previewUrl) {
    return (
      <button onClick={() => onDownload(attachment)} className="group relative rounded-lg overflow-hidden border border-border/50 max-w-[200px]">
        <img src={previewUrl} alt={attachment.name} className="max-h-[140px] w-auto object-cover rounded-lg" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Download className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    );
  }

  return (
    <button onClick={() => onDownload(attachment)} className="flex items-center gap-2 bg-muted hover:bg-muted/80 transition-colors rounded-lg px-3 py-2 text-xs text-foreground">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="text-left min-w-0">
        <p className="truncate max-w-[150px] font-medium">{attachment.name}</p>
        <p className="text-muted-foreground">{formatFileSize(attachment.size)}</p>
      </div>
      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
    </button>
  );
}
