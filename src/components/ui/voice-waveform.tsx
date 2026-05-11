import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  stream: MediaStream | null;
  className?: string;
  barCount?: number;
  height?: number;
}

/**
 * Live audio frequency visualizer.
 * Renders animated bars on a canvas that react to the pitch and volume
 * of the provided MediaStream in real time.
 */
export function VoiceWaveform({
  stream,
  className,
  barCount = 32,
  height = 32,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedRef = useRef<number[]>(new Array(barCount).fill(0));

  useEffect(() => {
    if (!stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const AudioCtx =
      (window.AudioContext as typeof AudioContext | undefined) ||
      ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtx) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    // Read --primary CSS variable for theming
    const primaryHsl = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim() || "221 83% 53%";

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      analyser.getByteFrequencyData(freqData);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const usableBins = Math.floor(freqData.length * 0.7); // ignore very high frequencies
      const binsPerBar = Math.max(1, Math.floor(usableBins / barCount));
      const gap = 2 * dpr;
      const barWidth = (w - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) {
          sum += freqData[i * binsPerBar + j];
        }
        const avg = sum / binsPerBar / 255; // 0..1

        // Smooth between frames (lerp)
        const prev = smoothedRef.current[i] ?? 0;
        const target = Math.pow(avg, 0.7); // perceptual boost
        const next = prev + (target - prev) * 0.35;
        smoothedRef.current[i] = next;

        const minH = 2 * dpr;
        const barH = Math.max(minH, next * h);
        const x = i * (barWidth + gap);
        const y = (h - barH) / 2;

        const alpha = 0.55 + next * 0.45;
        ctx.fillStyle = `hsla(${primaryHsl} / ${alpha})`;
        const r = Math.min(barWidth / 2, 2 * dpr);
        // Rounded rect
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, y + barH - r);
        ctx.quadraticCurveTo(x + barWidth, y + barH, x + barWidth - r, y + barH);
        ctx.lineTo(x + r, y + barH);
        ctx.quadraticCurveTo(x, y + barH, x, y + barH - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      try { source.disconnect(); } catch { /* noop */ }
      audioCtx.close().catch(() => { /* noop */ });
      smoothedRef.current = new Array(barCount).fill(0);
    };
  }, [stream, barCount]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full", className)}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
