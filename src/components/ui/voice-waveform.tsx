import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  stream: MediaStream | null;
  className?: string;
  height?: number;
  /** Approximate width per bar in CSS pixels. Bars auto-fit container width. */
  barWidth?: number;
  /** Gap between bars in CSS pixels. */
  barGap?: number;
}

/**
 * Live, scrolling audio waveform visualizer.
 * New amplitude samples enter from the right and scroll to the left,
 * creating an oscilloscope-style flow that reacts to voice volume/pitch.
 * Auto-resizes to container width.
 */
export function VoiceWaveform({
  stream,
  className,
  height = 32,
  barWidth = 3,
  barGap = 2,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    let rafId = 0;
    const dpr = window.devicePixelRatio || 1;
    let history: number[] = [];
    let maxBars = 0;

    const primaryHsl =
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
      "221 83% 53%";

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const slot = (barWidth + barGap) * dpr;
      maxBars = Math.max(8, Math.floor(canvas.width / slot));
      // Pad / truncate history to new size
      if (history.length < maxBars) {
        history = new Array(maxBars - history.length).fill(0).concat(history);
      } else if (history.length > maxBars) {
        history = history.slice(history.length - maxBars);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      analyser.getByteFrequencyData(freqData);

      // Compute weighted amplitude across speech-relevant bins (skip very low / very high).
      const start = Math.floor(freqData.length * 0.02);
      const end = Math.floor(freqData.length * 0.6);
      let sum = 0;
      let weightSum = 0;
      for (let i = start; i < end; i++) {
        const w = 1; // equal weight; emphasises overall energy
        sum += freqData[i] * w;
        weightSum += w;
      }
      const avg = weightSum > 0 ? sum / weightSum / 255 : 0;
      const sample = Math.pow(avg, 0.65); // perceptual boost

      // Push new sample on the right, scroll left
      history.push(sample);
      if (history.length > maxBars) history.shift();

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const slot = (barWidth + barGap) * dpr;
      const bw = barWidth * dpr;
      const minH = 2 * dpr;
      const centerY = h / 2;

      for (let i = 0; i < history.length; i++) {
        const v = history[i];
        const barH = Math.max(minH, v * h);
        const x = i * slot;
        const y = centerY - barH / 2;
        const alpha = 0.4 + v * 0.6;
        ctx.fillStyle = `hsla(${primaryHsl} / ${alpha})`;
        const r = Math.min(bw / 2, 2 * dpr);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + bw - r, y);
        ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
        ctx.lineTo(x + bw, y + barH - r);
        ctx.quadraticCurveTo(x + bw, y + barH, x + bw - r, y + barH);
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
    };
  }, [stream, barWidth, barGap]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block w-full", className)}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
