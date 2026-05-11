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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
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
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
            >
              {transcribing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Transcribing…
                </>
              ) : recording ? (
                <>
                  <MicOff className="h-3.5 w-3.5" />
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive-foreground opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive-foreground" />
                  </span>
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Dictate
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            {transcribing
              ? "Transcribing your audio…"
              : recording
                ? "Click to stop recording"
                : "Speak to autofill the form with Tony AI"}
          </TooltipContent>
        </Tooltip>

        {recording && (
          <span className="text-xs text-muted-foreground italic">Recording… speak now</span>
        )}
      </div>

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
