import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => Promise<void> | void;
}

const BAR_COUNT = 28;

export function TaskVoiceRecorder({ disabled, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopAll = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { sourceRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    sourceRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setLevels(Array(BAR_COUNT).fill(0));
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const startMeter = (stream: MediaStream) => {
    const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const buckets = BAR_COUNT;
    const step = Math.floor(data.length / buckets);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const next: number[] = new Array(buckets);
      for (let i = 0; i < buckets; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j];
        const avg = sum / step / 255; // 0..1
        // gentle curve to make quiet voice still readable
        next[i] = Math.min(1, Math.pow(avg, 0.7) * 1.3);
      }
      setLevels(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

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
      startMeter(stream);
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
      <Button type="button" variant="outline" size="sm" disabled className="gap-2 rounded-full">
        <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
      </Button>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/5 pl-3 pr-1 py-1 shadow-[0_0_0_4px_hsl(0_84%_60%/0.06)]">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <div
          className="flex items-center gap-[2px] h-6 w-[140px]"
          aria-label="Microphone input level"
          role="img"
        >
          {levels.map((v, i) => {
            const h = Math.max(8, Math.round(v * 100));
            return (
              <span
                key={i}
                className="flex-1 rounded-full bg-red-500/80"
                style={{ height: `${h}%`, transition: "height 60ms linear" }}
              />
            );
          })}
        </div>
        <span className="tabular-nums font-medium text-red-500 text-xs min-w-[36px] text-right">
          {fmt(elapsed)}
        </span>
        <Button
          type="button"
          size="icon"
          onClick={stop}
          className="h-7 w-7 rounded-full bg-red-500 hover:bg-red-600 text-white shrink-0"
          aria-label="Stop recording"
        >
          <Square className="h-3 w-3 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={start}
      disabled={disabled}
      className="gap-2 rounded-full border-dashed hover:border-solid hover:bg-primary/5 hover:text-primary hover:border-primary/40 transition-all group"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <Mic className="h-3 w-3" />
      </span>
      Record voice note
    </Button>
  );
}
