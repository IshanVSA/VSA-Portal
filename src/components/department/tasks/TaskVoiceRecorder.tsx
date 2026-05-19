import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => Promise<void> | void;
}

export function TaskVoiceRecorder({ disabled, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const stopAll = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = (Date.now() - startTimeRef.current) / 1000;
        stopAll();
        setRecording(false);
        if (blob.size === 0) return;
        try {
          setUploading(true);
          await onRecorded(blob, duration);
        } catch (err: any) {
          toast.error(err?.message || "Failed to upload voice note");
        } finally {
          setUploading(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      startTimeRef.current = Date.now();
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);
      setRecording(true);
    } catch (err: any) {
      toast.error(err?.message || "Microphone permission denied");
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (uploading) {
    return (
      <Button type="button" variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
      </Button>
    );
  }

  if (recording) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={stop} className="gap-2">
        <Square className="h-3.5 w-3.5" />
        Stop · {fmt(elapsed)}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={start} disabled={disabled} className="gap-2">
      <Mic className="h-4 w-4" />
      Record voice note
    </Button>
  );
}
