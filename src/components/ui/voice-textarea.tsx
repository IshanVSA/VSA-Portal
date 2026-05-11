import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VoiceWaveform } from "@/components/ui/voice-waveform";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VoiceTextareaProps extends TextareaProps {
  onValueChange?: (value: string) => void;
}

export function VoiceTextarea({ className, value, onValueChange, onChange, ...props }: VoiceTextareaProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      chunksRef.current = [];
      const recorder = new MediaRecorder(mediaStream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(null);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          toast.error("No audio recorded.");
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
            toast.error("Could not transcribe audio. Try speaking louder.");
            return;
          }

          const current = typeof value === "string" ? value : "";
          const newValue = current ? `${current} ${text.trim()}` : text.trim();
          onValueChange?.(newValue);
          toast.success("Voice transcribed successfully");
        } catch (err) {
          console.error("Transcription error:", err);
          toast.error(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied. Please allow mic access.");
    }
  }, [value, onValueChange]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  return (
    <div className="relative">
      <Textarea
        className={cn("pr-12", className)}
        value={value}
        onChange={onChange}
        {...props}
      />
      <div className="absolute top-2 right-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={recording ? "destructive" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
            >
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {transcribing ? "Transcribing…" : recording ? "Stop recording" : "Speak to type"}
          </TooltipContent>
        </Tooltip>
      </div>
      {recording && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          <span className="text-xs text-destructive font-medium">Recording…</span>
        </div>
      )}
    </div>
  );
}
