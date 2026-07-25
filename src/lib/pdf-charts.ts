import { PDF_COLORS, ensureSpace } from "./pdf-theme";

type RGB = [number, number, number];

function rgba(rgb: RGB): [number, number, number] {
  return rgb;
}

interface ChartBase {
  title?: string;
  color: RGB;
  height?: number;
}

function drawChartFrame(
  doc: any,
  y: number,
  height: number,
  title: string | undefined,
  color: RGB,
): { x: number; y: number; w: number; h: number; innerX: number; innerY: number; innerW: number; innerH: number } {
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const w = pageWidth - 28;

  if (title) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...color);
    doc.text(title, x + 7, y);
    y += 4;
  }

  // Chart card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, height, 2, 2, "FD");

  const padL = 22;
  const padR = 10;
  const padT = 8;
  const padB = 14;

  return {
    x, y, w, h: height,
    innerX: x + padL,
    innerY: y + padT,
    innerW: w - padL - padR,
    innerH: height - padT - padB,
  };
}

function withAlpha(doc: any, alpha: number, fn: () => void) {
  const gs = (doc as any).GState ? new (doc as any).GState({ opacity: alpha }) : null;
  if (gs) (doc as any).setGState(gs);
  fn();
  if (gs) (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
}

/** Draw a simple bar chart with numeric values. */
export function drawBarChart(
  doc: any,
  y: number,
  data: { label: string; value: number }[],
  opts: ChartBase & { valueFormatter?: (n: number) => string },
): number {
  const height = opts.height ?? 60;
  y = ensureSpace(doc, y + 2, height + (opts.title ? 8 : 4));
  const frame = drawChartFrame(doc, y, height, opts.title, opts.color);

  if (data.length === 0) return frame.y + frame.h + 4;

  const max = Math.max(...data.map((d) => d.value), 1);
  // Adaptive gap so bars always fit inside the frame regardless of count
  const gap = data.length > 20 ? 1 : data.length > 12 ? 2 : 4;
  const totalGap = gap * Math.max(0, data.length - 1);
  const barW = Math.max(1.2, (frame.innerW - totalGap) / data.length);
  const baseY = frame.innerY + frame.innerH;

  // Y-axis line
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(frame.innerX - 2, frame.innerY, frame.innerX - 2, baseY);
  doc.line(frame.innerX - 2, baseY, frame.innerX + frame.innerW, baseY);

  // Y-axis label (max)
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.light);
  const fmt = opts.valueFormatter ?? ((n: number) => n.toLocaleString());
  doc.text(fmt(max), frame.x + 4, frame.innerY + 2);
  doc.text("0", frame.x + 4, baseY + 1);

  data.forEach((d, i) => {
    const h = (d.value / max) * frame.innerH;
    const bx = frame.innerX + i * (barW + gap);
    const by = baseY - h;
    doc.setFillColor(...opts.color);
    doc.roundedRect(bx, by, barW, Math.max(0.5, h), 1, 1, "F");

    // Label
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.medium);
    const label = d.label.length > 14 ? d.label.slice(0, 12) + "…" : d.label;
    const labelW = doc.getTextWidth(label);
    doc.text(label, bx + barW / 2 - labelW / 2, baseY + 5);
  });

  return frame.y + frame.h + 4;
}

/** Draw a line/area chart over sequential data. */
export function drawLineChart(
  doc: any,
  y: number,
  data: { label: string; value: number }[],
  opts: ChartBase & { valueFormatter?: (n: number) => string; fill?: boolean },
): number {
  const height = opts.height ?? 60;
  y = ensureSpace(doc, y + 2, height + (opts.title ? 8 : 4));
  const frame = drawChartFrame(doc, y, height, opts.title, opts.color);
  if (data.length === 0) return frame.y + frame.h + 4;

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? frame.innerW / (data.length - 1) : 0;
  const baseY = frame.innerY + frame.innerH;

  // Axes
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(frame.innerX - 2, frame.innerY, frame.innerX - 2, baseY);
  doc.line(frame.innerX - 2, baseY, frame.innerX + frame.innerW, baseY);

  // Gridlines (3 horizontal)
  for (let i = 1; i <= 3; i++) {
    const gy = baseY - (frame.innerH * i) / 4;
    doc.setDrawColor(240, 240, 244);
    doc.line(frame.innerX - 2, gy, frame.innerX + frame.innerW, gy);
  }

  // Y-axis labels
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.light);
  const fmt = opts.valueFormatter ?? ((n: number) => n.toLocaleString());
  doc.text(fmt(max), frame.x + 4, frame.innerY + 2);
  doc.text("0", frame.x + 4, baseY + 1);

  const points = data.map((d, i) => ({
    x: frame.innerX + i * stepX,
    y: baseY - (d.value / max) * frame.innerH,
  }));

  // Area fill under line
  if (opts.fill !== false && points.length > 1) {
    withAlpha(doc, 0.15, () => {
      doc.setFillColor(...opts.color);
      const lines: [number, number][] = [];
      for (let i = 1; i < points.length; i++) {
        lines.push([points[i].x - points[i - 1].x, points[i].y - points[i - 1].y]);
      }
      // Use triangles as a fallback fill
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        doc.triangle(p1.x, p1.y, p2.x, p2.y, p2.x, baseY, "F");
        doc.triangle(p1.x, p1.y, p2.x, baseY, p1.x, baseY, "F");
      }
    });
  }

  // Line stroke
  doc.setDrawColor(...opts.color);
  doc.setLineWidth(0.6);
  for (let i = 1; i < points.length; i++) {
    doc.line(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
  }

  // Dots on sparse data
  if (points.length <= 20) {
    doc.setFillColor(...opts.color);
    for (const p of points) {
      doc.circle(p.x, p.y, 0.8, "F");
    }
  }

  // X-axis labels (first, middle, last)
  doc.setFontSize(6.5);
  doc.setTextColor(...PDF_COLORS.medium);
  const marks = data.length > 6
    ? [0, Math.floor(data.length / 2), data.length - 1]
    : data.map((_, i) => i);
  for (const i of marks) {
    const label = data[i].label;
    const lx = frame.innerX + i * stepX;
    const lw = doc.getTextWidth(label);
    doc.text(label, lx - lw / 2, baseY + 5);
  }

  return frame.y + frame.h + 4;
}

/** Horizontal stacked share bar (donut alternative). */
export function drawShareBar(
  doc: any,
  y: number,
  segments: { label: string; value: number; color: RGB }[],
  opts: { title?: string; height?: number },
): number {
  const height = opts.height ?? 24;
  y = ensureSpace(doc, y + 2, height + (opts.title ? 10 : 6));
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = 14;
  const w = pageWidth - 28;

  if (opts.title) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PDF_COLORS.dark);
    doc.text(opts.title, x + 7, y);
    y += 4;
  }

  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const barY = y + 2;
  const barH = 8;
  let cx = x;
  segments.forEach((s) => {
    const sw = (s.value / total) * w;
    doc.setFillColor(...s.color);
    doc.rect(cx, barY, sw, barH, "F");
    cx += sw;
  });
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.rect(x, barY, w, barH, "S");

  // Legend
  let ly = barY + barH + 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let lx = x;
  segments.forEach((s) => {
    const pct = Math.round((s.value / total) * 1000) / 10;
    const txt = `${s.label}: ${s.value.toLocaleString()} (${pct}%)`;
    doc.setFillColor(...s.color);
    doc.rect(lx, ly - 2.5, 3, 3, "F");
    doc.setTextColor(...PDF_COLORS.medium);
    doc.text(txt, lx + 4.5, ly);
    lx += doc.getTextWidth(txt) + 12;
  });

  return ly + 4;
}
