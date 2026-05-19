import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { VoiceWaveform } from "@/components/ui/voice-waveform";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

interface VoiceDictationProps {
  formType: string;
  onFieldsExtracted: (fields: Record<string, any>) => void;
}

export function VoiceDictation({ formType, onFieldsExtracted }: VoiceDictationProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setActiveStream(stream);
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setActiveStream(null);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          toast.error("No audio recorded. Please try again.");
          return;
        }

        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("file", blob, "recording.webm");

          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: formData,
            }
          );

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Transcription failed (${res.status})`);
          }

          const { text } = await res.json();
          if (!text?.trim()) {
            toast.error("Could not transcribe audio. Please try again or speak louder.");
            return;
          }

          setEditableTranscript(text.trim());
          setShowDialog(true);
        } catch (err) {
          console.error("Transcription error:", err);
          toast.error(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Mic access error:", err);
      toast.error("Microphone access denied. Please allow mic access and try again.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  const handleAutofill = useCallback(async () => {
    if (!editableTranscript.trim()) return;
    setExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke("extract-ticket-fields", {
        body: { transcript: editableTranscript.trim(), formType } as Record<string, unknown>,
      });

      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Failed to extract fields"));
      if (data?.fields) {
        onFieldsExtracted(data.fields);
        toast.success("Form fields autofilled from your dictation!");
        setShowDialog(false);
        setEditableTranscript("");
      } else {
        toast.error("Could not extract fields. Try again with more detail.");
      }
    } catch (err: any) {
      console.error("Extraction error:", err);
      toast.error(err?.message || "Failed to extract fields. Please try again.");
    } finally {
      setExtracting(false);
    }
  }, [editableTranscript, formType, onFieldsExtracted]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setEditableTranscript("");
  }, []);

  return (
    <>
      {!recording && (
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={startRecording}
                disabled={transcribing}
              >
                {transcribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Transcribing…
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-primary" />
                    Dictate with Tony AI
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[200px]">
              {transcribing ? "Transcribing your audio…" : "Speak to autofill the form with Tony AI"}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {recording && (
        <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent p-3 animate-fade-in">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 50%, hsl(var(--primary) / 0.18), transparent 60%)",
            }}
          />
          <div className="relative flex items-center gap-3">
            {/* AI Orb — click to stop */}
            <button
              type="button"
              onClick={stopRecording}
              aria-label="Stop recording"
              className="group relative flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
              <span className="absolute inset-1 rounded-full bg-primary/20 animate-pulse" />
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--primary) / 0.35), hsl(var(--primary)))",
                  animation: "spin 3s linear infinite",
                }}
              />
              <span className="absolute inset-[3px] rounded-full bg-background" />
              <span className="relative h-3 w-3 rounded-[3px] bg-primary transition-transform group-hover:scale-110" />
            </button>

            <div className="flex flex-1 min-w-0 flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                <span
                  className="text-xs font-medium bg-clip-text text-transparent bg-[length:200%_100%]"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--foreground)) 50%, hsl(var(--primary)) 100%)",
                    animation: "shimmer 2.2s linear infinite",
                  }}
                >
                  Tony is listening… speak naturally
                </span>
              </div>
              <div className="relative w-full">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -inset-y-2 rounded-full blur-xl opacity-60"
                  style={{
                    background:
                      "radial-gradient(60% 100% at 50% 50%, hsl(var(--primary) / 0.35), transparent 70%)",
                  }}
                />
                <VoiceWaveform stream={activeStream} height={36} className="relative w-full" />
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={stopRecording}
              className="shrink-0 h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <MicOff className="h-3.5 w-3.5" />
              Stop
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review Transcript</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Review or edit the transcribed text, then click Autofill to populate the form.
          </p>
          <Textarea
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            className="min-h-[120px]"
            placeholder="Your dictated text will appear here..."
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={extracting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAutofill}
              disabled={extracting || !editableTranscript.trim()}
              className="gap-1.5"
            >
              {extracting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5" /> Autofill Form</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
