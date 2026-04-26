import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User, Loader2, Mic, MicOff, MessageCircle, X, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "👋 Hi! I'm Tony AI, your VSA assistant. I can help you navigate the platform, answer questions, create support tickets, or give marketing tips. Try saying **\"Create a ticket for...\"** to get started!",
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

// Web Speech API types
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

export function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Voice dictation is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied. Please enable it in your browser settings.");
      } else if (event.error !== "aborted") {
        toast.error("Voice recognition error. Please try again.");
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
  }, [isListening]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const apiMessages = updatedMessages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const content = assistantSoFar;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id !== "welcome") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
        }
        return [...prev, { id: crypto.randomUUID(), role: "assistant", content }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken
            ? { Authorization: `Bearer ${authToken}` }
            : { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }),
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      toast.error(e?.message || "Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl flex items-center justify-center transition-shadow hover:scale-105 active:scale-95"
          >
            <MessageCircle className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Popup */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 w-auto sm:w-[380px] h-[70vh] sm:h-[520px] max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                  <img src="/favicon.png" alt="VSA" className="h-6 w-6 object-contain" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Tony AI</h3>
                  <p className="text-[10px] text-muted-foreground">AI-Powered help</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}
                >
                  <div
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <Bot className="h-3 w-3 text-primary" />
                    ) : (
                      <User className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2 text-[13px] max-w-[80%] leading-relaxed",
                      msg.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-0.5 [&>ul]:my-0.5 [&>ol]:my-0.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 text-[13px]">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="rounded-xl px-3 py-2 bg-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-border/60 p-3">
              {isListening && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-[11px] text-muted-foreground">Listening… speak now</span>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant={isListening ? "destructive" : "outline"}
                  onClick={toggleVoice}
                  disabled={isLoading}
                  className="shrink-0 h-9 w-9"
                  title={isListening ? "Stop dictation" : "Voice dictation"}
                >
                  {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening…" : "Type a message…"}
                  className="flex-1 h-9 text-sm"
                  disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="h-9 w-9">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
