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
 * Live, scrolling audio waveform visualizer (ChatGPT-style).
 * Renders a thin dotted baseline across the full width. New amplitude
 * samples enter from the right and scroll left. When the user speaks,
 * dots "bump" into vertical bars whose height tracks voice loudness.
 */
export function VoiceWaveform({
  stream,
  className,
  height = 32,
  barWidth = 2,
  barGap = 4,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let history: number[] = [];
    let displayed: number[] = [];
    let envelope = 0;
    let maxBars = 0;

    const primaryHsl =
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
      "221 83% 53%";
    const mutedHsl =
      getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground").trim() ||
      "215 20% 65%";

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const slot = (barWidth + barGap) * dpr;
      maxBars = Math.max(8, Math.floor(canvas.width / slot));
      if (history.length < maxBars) {
        const pad = new Array(maxBars - history.length).fill(0);
        history = pad.concat(history);
        displayed = pad.slice().concat(displayed);
      } else if (history.length > maxBars) {
        history = history.slice(history.length - maxBars);
        displayed = displayed.slice(displayed.length - maxBars);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Static idle render (dotted line) when no stream
    const renderIdle = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const slot = (barWidth + barGap) * dpr;
      const bw = barWidth * dpr;
      const dotH = Math.max(2 * dpr, bw);
      const centerY = h / 2;
      ctx.fillStyle = `hsla(${mutedHsl} / 0.45)`;
      for (let i = 0; i < maxBars; i++) {
        const x = i * slot;
        ctx.beginPath();
        ctx.arc(x + bw / 2, centerY, bw / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (!stream) {
      renderIdle();
      return () => {
        ro.disconnect();
      };
    }

    const AudioCtx =
      (window.AudioContext as typeof AudioContext | undefined) ||
      ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtx) {
      renderIdle();
      return () => ro.disconnect();
    }

    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    let rafId = 0;

    const draw = () => {
      analyser.getByteFrequencyData(freqData);

      const start = Math.floor(freqData.length * 0.02);
      const end = Math.floor(freqData.length * 0.6);
      let sum = 0;
      for (let i = start; i < end; i++) sum += freqData[i];
      const avg = sum / (end - start) / 255;
      const target = Math.pow(avg, 0.6);

      // Asymmetric envelope follower: fast attack, slow release
      const attack = 0.45;
      const release = 0.12;
      const coeff = target > envelope ? attack : release;
      envelope += (target - envelope) * coeff;

      history.push(envelope);
      if (history.length > maxBars) history.shift();
      displayed.push(envelope);
      if (displayed.length > maxBars) displayed.shift();

      // Ease all displayed bars toward their history targets for fluid motion
      const ease = 0.25;
      for (let i = 0; i < displayed.length; i++) {
        displayed[i] += (history[i] - displayed[i]) * ease;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const slot = (barWidth + barGap) * dpr;
      const bw = barWidth * dpr;
      const minH = bw; // dot diameter when silent
      const centerY = h / 2;
      const maxH = h * 0.95;

      for (let i = 0; i < displayed.length; i++) {
        const v = displayed[i];
        const barH = Math.max(minH, v * maxH);
        const x = i * slot;
        const y = centerY - barH / 2;
        const isActive = v > 0.05;
        const alpha = isActive ? 0.6 + v * 0.4 : 0.4;
        const color = isActive ? primaryHsl : mutedHsl;
        ctx.fillStyle = `hsla(${color} / ${alpha})`;

        if (barH <= minH * 1.2) {
          // dot
          ctx.beginPath();
          ctx.arc(x + bw / 2, centerY, bw / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // rounded bar
          const r = bw / 2;
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
