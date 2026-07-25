# Unified Report — Match Pasted HTML Template Exactly

The pasted file is a fully-designed HTML report (Inter font, dark navy masthead, gradient section icons, SVG line/bar charts, color-accented tables, "AI Performance Analysis" cards, A4 page breaks). Our current PDF is built with jsPDF primitives, which cannot reproduce this layout faithfully. The correct fix is to generate the report as HTML and export it to PDF via the browser's print pipeline.

## What changes

1. **New renderer** `src/lib/unified-report-html.ts`
   - Pure functions that build the exact HTML string from the same data `UnifiedReportTab` already fetches (GA4 totals, top pages, hourly, geography; SEO clicks/impr/CTR/pos, brand vs non-brand, devices, countries, top queries/pages; Google Ads KPIs, daily trend, top campaigns; Social FB/IG activity + engagement).
   - Sections in this order, each on its own A4 page (`<div class="pagebreak">`):
     1. Masthead (title, clinic, period pill)
     2. Website Analytics — KPI grid, Daily Page Views line chart (SVG), Top Pages table, Pages/Session bar list, Visitor Geography table, Traffic by Hour bar chart (SVG), AI card
     3. SEO Performance — KPI grid, Brand vs Non-Brand share, Device table, Top Countries table, Top Queries/Pages tables, AI card
     4. Google Ads — KPI grid, Daily Clicks + Daily Spend line charts, Top Campaigns by Spend bar chart, Campaign table, AI card
     5. Social Media — Facebook + Instagram KPI mini-grids, activity/engagement bar charts, AI card
   - Uses the exact CSS classes / colors / SVG structure from the pasted file (masthead gradient, `.kpi`, `.pill-pos/neg/flat`, `.card`, `.tbl` with `acc-orange/teal/blue/purple`, `.barlist`, `.ai-card`, `.pagebreak`, `@page{size:A4}`).
   - SVG chart helpers: `lineChart(points, color)`, `barChart(values, labels, gradientId, colors)`, `shareBar(brand, nonBrand)`.

2. **New print flow** in `src/components/department/UnifiedReportTab.tsx`
   - Replace the jsPDF pipeline: open a hidden iframe, write the generated HTML, call `iframe.contentWindow.print()`. The user chooses "Save as PDF" from the browser dialog, producing an A4 file that matches the template pixel-for-pixel.
   - Keep the existing "Generate Report" button, loading state, date range, and AI-analysis calls (`generate-report-analysis`) unchanged.
   - Retain the compare/YoY toggles that already feed the KPI pills.

3. **Delete / retire**
   - `src/lib/pdf-charts.ts` and the jsPDF chart calls in `UnifiedReportTab.tsx` are no longer used by this report (kept only if other pages import them — will remove if unused).
   - `src/lib/pdf-theme.ts` helpers used only by the unified report will be removed; anything shared with per-department PDFs stays.

## Technical notes

- Font: template embeds Inter via base64. To keep the bundle small, load Inter via a `<link>` to Google Fonts inside the generated HTML (print output is visually identical); fall back to `system-ui`.
- Charts are inline SVG (no chart library) so they render perfectly in the print dialog with no canvas rasterization.
- All numbers/labels come from the same hooks currently used (`useGa4Compare`, `useSearchConsole`, `useGoogleAdsKPIs`, social analytics query, top-pages query). No new data fetches.
- AI text: reuse existing `generate-report-analysis` edge function; render its paragraphs inside the color-tinted `.ai-card` per section.
- Output is "Save as PDF" from the browser rather than a direct `.pdf` download. This is the only way to reproduce the pasted design faithfully without a server-side headless-Chrome step.

## Out of scope

- No changes to data sources, edge functions, or per-department analytics tabs.
- No changes to other PDF exports (per-department reports keep their current jsPDF renderers).
