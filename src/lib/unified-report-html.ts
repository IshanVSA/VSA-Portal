// Unified Report HTML renderer — produces a print-ready A4 document that
// matches the pasted design template (masthead, gradient section icons,
// SVG line/bar charts, colored KPI cards, AI analysis cards, page breaks).
//
// Usage: buildUnifiedReportHTML(data) -> string; call printHTML(html).

import { format } from "date-fns";
import vsaLogoUrl from "@/assets/vsa-logo.jpg";

// ─── types ─────────────────────────────────────────────────────────
export interface KpiCmp { cur: number; prev: number; }
export interface UnifiedReportData {
  clinicName: string;
  periodLabel: string;         // "Jun 26, 2026 – Jul 25, 2026"
  timezone: string;

  website?: {
    kpi: {
      views: KpiCmp; visitors: KpiCmp; engaged: KpiCmp;
      engagementRate: KpiCmp;    // 0-1
      avgSessionSec: KpiCmp;
      pagesPerSession: KpiCmp;
    };
    daily: { date: string; views: number }[];
    hourly: { hour: number; views: number }[];
    topPages: { path: string; views: number; visitors: number }[];
    sessionDepth: { one_page: number; two_three: number; four_plus: number; total: number };
    geoTotal: number;
    geo: { country: string; visitors: number; regions: string[] }[];
    aiAnalysis: string;
  };

  seo?: {
    kpi: {
      organicSessions: KpiCmp;
      clicks: KpiCmp;
      impressions: KpiCmp;
      ctr: KpiCmp;                 // 0-1
      avgPosition: KpiCmp;         // lower is better
    };
    channels: { channel: string; sessions: number }[];
    brandVsNonBrand?: { brand: number; nonBrand: number };
    devices: { device: string; clicks: number; impressions: number }[];
    countries: { country: string; clicks: number; impressions: number }[];
    topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    topPages: { page: string; clicks: number; impressions: number; ctr: number }[];
    aiAnalysis: string;
  };

  ads?: {
    kpi: {
      spend: KpiCmp; clicks: KpiCmp; impressions: KpiCmp;
      conversions: KpiCmp; ctr: KpiCmp; cpc: KpiCmp;
    };
    daily: { date: string; clicks: number; cost: number }[];
    campaigns: { name: string; cost: number; clicks: number; impressions: number }[];
    aiAnalysis: string;
  };

  social?: {
    facebook?: { likes:number; followers:number; reach:number; engagement:number; page_views:number; video_views:number; fan_adds:number; };
    instagram?: { username?: string; followers:number; media_count:number; reach:number; engagement_rate:number; profile_views:number; website_clicks:number; saves:number; total_interactions:number; };
    aiAnalysis: string;
  };
}

// ─── utils ─────────────────────────────────────────────────────────
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const nfmt = (n: number) => (n ?? 0).toLocaleString();
const dur = (s: number) => { if(!s||s<=0)return "0s"; const m=Math.floor(s/60); const r=Math.round(s%60); return m>0?`${m}m ${r}s`:`${r}s`; };
const money = (v: number) => `$${(v??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function pill(cur: number, prev: number, invert = false): string {
  if ((!prev && !cur) || prev === 0) return `<span class="pill pill-flat">—</span>`;
  const raw = ((cur - prev) / prev) * 100;
  const pct = Math.round(raw * 10) / 10;
  const good = invert ? pct < 0 : pct >= 0;
  const cls = good ? "pill-pos" : "pill-neg";
  const arrow = good
    ? `<svg class="arr" width="6" height="5" viewBox="0 0 10 8"><path d="M5 0l5 8H0z" fill="currentColor"/></svg>`
    : `<svg class="arr" width="6" height="5" viewBox="0 0 10 8"><path d="M5 8L0 0h10z" fill="currentColor"/></svg>`;
  const sign = pct >= 0 ? "+" : "";
  return `<span class="pill ${cls}">${arrow}${sign}${pct}%</span>`;
}

function kpiCard(label: string, valueHTML: string, cur: number, prev: number, prevDisplay: string, accent: string, invert = false) {
  return `<div class="kpi" style="border-top-color:${accent}">
    <div class="kpi-top"><span class="kpi-label">${esc(label)}</span>${pill(cur, prev, invert)}</div>
    <div class="kpi-value">${valueHTML}</div>
    <div class="kpi-prev">Previous&nbsp;&nbsp;${prevDisplay}</div>
  </div>`;
}

function sectionHead(icon: string, gradient: string, title: string, rule: string): string {
  return `<div class="sec-head">
    <span class="sec-icon" style="background:linear-gradient(135deg,${gradient})">${icon}</span>
    <span class="sec-title">${esc(title)}</span>
    <span class="sec-rule" style="background:linear-gradient(90deg,${rule},transparent)"></span>
  </div>`;
}

function aiCard(bg: string, border: string, headColor: string, text: string): string {
  const paragraphs = (text || "No analysis available.").split(/\n{2,}/).map(p=>p.trim()).filter(Boolean);
  return `<div class="ai-card" style="background:${bg};border-color:${border}">
    <div class="ai-head" style="color:${headColor}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="${headColor}" style="margin-right:5px"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/></svg>
      AI Performance Analysis
    </div>
    ${paragraphs.map(p => `<p>${esc(p)}</p>`).join("")}
  </div>`;
}

// SVG line chart. viewBox 660x190, matches template.
function lineChart(data: { label: string; value: number }[], color: string, gradId: string): string {
  if (data.length < 2) return "";
  const w = 660, h = 190, padL = 46, padR = 12, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = Math.max(...data.map(d => d.value), 1);
  const stepX = iw / (data.length - 1);
  const pts = data.map((d, i) => ({ x: padL + i * stepX, y: padT + ih - (d.value / max) * ih, v: d.value, l: d.label }));
  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${pts[0].x.toFixed(1)},${(padT+ih).toFixed(1)} ${polyline} ${pts[pts.length-1].x.toFixed(1)},${(padT+ih).toFixed(1)}`;
  const peak = pts.reduce((a, b) => b.v > a.v ? b : a, pts[0]);
  const gridYs = [padT + ih*0.25, padT + ih*0.5, padT + ih*0.75];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.01"/></linearGradient></defs>
    ${gridYs.map(y=>`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}" stroke="#EEF2F7" stroke-width="1"/>`).join("")}
    <line x1="${padL}" y1="${padT+ih}" x2="${w-padR}" y2="${padT+ih}" stroke="#E2E8F0" stroke-width="1"/>
    <polygon points="${area}" fill="url(#${gradId})"/>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="4.5" fill="${color}" opacity="0.15"/>
    <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="2.4" fill="#fff" stroke="${color}" stroke-width="1.8"/>
    <text x="${padL-8}" y="${padT+4}" class="ax" text-anchor="end">${nfmt(Math.round(max))}</text>
    <text x="${padL-8}" y="${padT+ih+3}" class="ax" text-anchor="end">0</text>
    <text x="${padL}" y="${h-6}" class="ax" text-anchor="start">${esc(data[0].label)}</text>
    <text x="${(padL + iw/2).toFixed(1)}" y="${h-6}" class="ax" text-anchor="middle">${esc(data[Math.floor(data.length/2)].label)}</text>
    <text x="${w-padR}" y="${h-6}" class="ax" text-anchor="end">${esc(data[data.length-1].label)}</text>
  </svg>`;
}

function barChart(data: { label: string; value: number }[], gradientStops: [string, string], gradId: string): string {
  if (data.length === 0) return "";
  const w = 660, h = 200, padL = 46, padR = 12, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = Math.max(...data.map(d => d.value), 1);
  const slot = iw / data.length;
  const barW = Math.max(4, slot * 0.62);
  const gridYs = [padT + ih*0.25, padT + ih*0.5, padT + ih*0.75];
  const bars = data.map((d, i) => {
    const bh = (d.value / max) * ih;
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + ih - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, bh).toFixed(1)}" rx="2.5" fill="url(#${gradId})"/>`;
  }).join("");
  const stride = data.length > 14 ? Math.ceil(data.length / 12) : 1;
  const labels = data.map((d, i) => {
    if (i % stride !== 0) return "";
    const x = padL + i * slot + slot / 2;
    const l = d.label.length > 12 ? d.label.slice(0, 11) + "…" : d.label;
    return `<text x="${x.toFixed(1)}" y="${h-11}" class="ax" style="font-size:7px" text-anchor="middle">${esc(l)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${gradientStops[0]}"/><stop offset="1" stop-color="${gradientStops[1]}"/></linearGradient></defs>
    ${gridYs.map(y=>`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}" stroke="#EEF2F7" stroke-width="1"/>`).join("")}
    <line x1="${padL}" y1="${padT+ih}" x2="${w-padR}" y2="${padT+ih}" stroke="#E2E8F0" stroke-width="1"/>
    <text x="${padL-8}" y="${padT+4}" class="ax" text-anchor="end">${nfmt(Math.round(max))}</text>
    <text x="${padL-8}" y="${padT+ih+3}" class="ax" text-anchor="end">0</text>
    ${bars}${labels}
  </svg>`;
}

function shareBar(brand: number, nonBrand: number): string {
  const total = brand + nonBrand || 1;
  const bp = (brand / total) * 100;
  const np = 100 - bp;
  return `<svg viewBox="0 0 660 60" class="chart">
    <rect x="0" y="8" width="${(bp*6.6).toFixed(1)}" height="22" rx="4" fill="#0D9488"/>
    <rect x="${(bp*6.6).toFixed(1)}" y="8" width="${(np*6.6).toFixed(1)}" height="22" rx="0" fill="#2563EB"/>
    <text x="6" y="46" class="lg">Branded: ${nfmt(brand)} (${bp.toFixed(0)}%)</text>
    <text x="220" y="46" class="lg">Non-Branded: ${nfmt(nonBrand)} (${np.toFixed(0)}%)</text>
  </svg>`;
}

// ─── section builders ─────────────────────────────────────────────
function websiteSection(d: UnifiedReportData["website"], tz: string): string {
  if (!d) return "";
  const k = d.kpi;
  const orange = "#EA580C";
  const kpis = [
    kpiCard("Page Views", nfmt(k.views.cur), k.views.cur, k.views.prev, nfmt(k.views.prev), orange),
    kpiCard("Unique Visitors", nfmt(k.visitors.cur), k.visitors.cur, k.visitors.prev, nfmt(k.visitors.prev), orange),
    kpiCard("Engaged Sessions", nfmt(k.engaged.cur), k.engaged.cur, k.engaged.prev, nfmt(k.engaged.prev), orange),
    kpiCard("Engagement Rate", `${(k.engagementRate.cur*100).toFixed(1)}%`, k.engagementRate.cur, k.engagementRate.prev, `${(k.engagementRate.prev*100).toFixed(1)}%`, orange),
    kpiCard("Avg. Session", dur(k.avgSessionSec.cur), k.avgSessionSec.cur, k.avgSessionSec.prev, dur(k.avgSessionSec.prev), orange),
    kpiCard("Pages / Session", k.pagesPerSession.cur.toFixed(1), k.pagesPerSession.cur, k.pagesPerSession.prev, k.pagesPerSession.prev.toFixed(1), orange),
  ].join("");

  const daily = d.daily.length > 1 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#EA580C"></span>
    <span class="card-title" style="color:#C2410C">Daily Page Views</span>
  </div>${lineChart(d.daily.map(x=>({label:format(new Date(x.date),"MMM d"), value:x.views})), "#EA580C", "gdv")}</div>` : "";

  const topPagesRows = d.topPages.slice(0, 10).map((p, i) => `<tr>
    <td class="al-center"><span class="rank" style="background:#FFEDD5;color:#9A3412">${i+1}</span></td>
    <td class="al-left"><span class="path">${esc(p.path)}</span></td>
    <td class="al-right"><b>${nfmt(p.views)}</b></td>
    <td class="al-right">${nfmt(p.visitors)}</td>
  </tr>`).join("");
  const topPages = d.topPages.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#EA580C"></span>
    <span class="card-title" style="color:#C2410C">Top Pages</span>
  </div><table class="tbl acc-orange"><thead><tr>
    <th class="al-center" style="width:30px">#</th><th class="al-left">Page</th>
    <th class="al-right" style="width:64px">Views</th><th class="al-right" style="width:64px">Visitors</th>
  </tr></thead><tbody>${topPagesRows}</tbody></table></div>` : "";

  const sd = d.sessionDepth;
  const sdRow = (label:string, value:number) => {
    const share = sd.total > 0 ? (value / sd.total) * 100 : 0;
    return `<div class="bl-row">
      <div class="bl-label">${esc(label)}</div>
      <div class="bl-track"><div class="bl-fill" style="width:${share.toFixed(1)}%;background:linear-gradient(90deg,#FB923C,#EA580C)"></div></div>
      <div class="bl-val">${nfmt(value)}</div><div class="bl-share">${share.toFixed(1)}%</div>
    </div>`;
  };
  const depthCard = sd && sd.total > 0 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#EA580C"></span>
    <span class="card-title" style="color:#C2410C">Pages / Session Mix</span>
  </div><div class="barlist">${sdRow("1 page",sd.one_page)}${sdRow("2–3 pages",sd.two_three)}${sdRow("4+ pages",sd.four_plus)}</div></div>` : "";

  const geoRows = d.geo.slice(0, 10).map(g => {
    const share = d.geoTotal > 0 ? ((g.visitors / d.geoTotal) * 100).toFixed(1) : "0";
    return `<tr>
      <td class="al-left"><span class="cc" style="background:#FFEDD5;color:#9A3412">${esc(g.country)}</span></td>
      <td class="al-left">${esc(g.regions.slice(0,3).join(", "))}</td>
      <td class="al-right"><b>${nfmt(g.visitors)}</b></td>
      <td class="al-right">${share}%</td>
    </tr>`;
  }).join("");
  const geoCard = d.geoTotal > 0 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#EA580C"></span>
    <span class="card-title" style="color:#C2410C">Visitor Geography</span>
  </div><table class="tbl acc-orange"><thead><tr>
    <th class="al-left" style="width:58px">Country</th><th class="al-left">Top Regions</th>
    <th class="al-right" style="width:70px">Visitors</th><th class="al-right" style="width:56px">Share</th>
  </tr></thead><tbody>${geoRows}</tbody></table></div>` : "";

  const hourly = d.hourly.length > 0 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#EA580C"></span>
    <span class="card-title" style="color:#C2410C">Traffic by Hour</span>
    <span class="card-sub">${esc(tz)}</span>
  </div>${barChart(d.hourly.map(h=>({label:`${String(h.hour).padStart(2,"0")}h`, value:h.views})), ["#FB923C","#EA580C"], "bghr")}</div>` : "";

  return `${sectionHead(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm7.9 9h-3.4a15.6 15.6 0 00-1.2-5.7A8 8 0 0119.9 11zM12 4.1c.9 1.1 2 3.4 2.4 6.9H9.6C10 7.5 11.1 5.2 12 4.1zM4.1 13h3.4c.1 2.1.5 4 1.2 5.7A8 8 0 014.1 13zm3.4-2H4.1a8 8 0 014.6-5.7A15.6 15.6 0 007.5 11zm2.1 2h4.8c-.4 3.5-1.5 5.8-2.4 6.9-.9-1.1-2-3.4-2.4-6.9zm5.7 5.7c.7-1.7 1.1-3.6 1.2-5.7h3.4a8 8 0 01-4.6 5.7z"/></svg>`,
    "#FB923C,#EA580C", "Website Analytics", "#FED7AA")}
    <div class="kpi-grid">${kpis}</div>
    ${daily}${topPages}${depthCard}${geoCard}${hourly}
    ${aiCard("#FFF7ED","#FED7AA","#9A3412", d.aiAnalysis)}`;
}

function seoSection(d: UnifiedReportData["seo"]): string {
  if (!d) return "";
  const k = d.kpi;
  const teal = "#0D9488";
  const kpis = [
    kpiCard("Organic Sessions", nfmt(k.organicSessions.cur), k.organicSessions.cur, k.organicSessions.prev, nfmt(k.organicSessions.prev), teal),
    kpiCard("Search Clicks", nfmt(k.clicks.cur), k.clicks.cur, k.clicks.prev, nfmt(k.clicks.prev), teal),
    kpiCard("Impressions", nfmt(k.impressions.cur), k.impressions.cur, k.impressions.prev, nfmt(k.impressions.prev), teal),
    kpiCard("CTR", `${(k.ctr.cur*100).toFixed(2)}%`, k.ctr.cur, k.ctr.prev, `${(k.ctr.prev*100).toFixed(2)}%`, teal),
    kpiCard("Avg. Position", k.avgPosition.cur > 0 ? k.avgPosition.cur.toFixed(1) : "—", k.avgPosition.cur, k.avgPosition.prev, k.avgPosition.prev>0?k.avgPosition.prev.toFixed(1):"—", teal, true),
  ].join("");

  const channels = d.channels.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#0D9488"></span>
    <span class="card-title" style="color:#0F766E">Sessions by Channel</span>
  </div>${barChart(d.channels.slice(0,8).map(c=>({label:c.channel, value:c.sessions})), ["#2DD4BF","#0D9488"], "gsch")}</div>` : "";

  const bnb = d.brandVsNonBrand && (d.brandVsNonBrand.brand + d.brandVsNonBrand.nonBrand) > 0
    ? `<div class="card"><div class="card-head">
        <span class="card-tick" style="background:#0D9488"></span>
        <span class="card-title" style="color:#0F766E">Brand vs Non-Brand Clicks</span>
      </div>${shareBar(d.brandVsNonBrand.brand, d.brandVsNonBrand.nonBrand)}</div>` : "";

  const devRows = d.devices.map(x => `<tr>
    <td class="al-left"><b>${esc(x.device)}</b></td>
    <td class="al-right">${nfmt(x.clicks)}</td>
    <td class="al-right">${nfmt(x.impressions)}</td>
  </tr>`).join("");
  const cntRows = d.countries.slice(0,10).map(x => `<tr>
    <td class="al-left"><span class="cc" style="background:#CCFBF1;color:#115E59">${esc(x.country)}</span></td>
    <td class="al-right"><b>${nfmt(x.clicks)}</b></td>
    <td class="al-right">${nfmt(x.impressions)}</td>
  </tr>`).join("");
  const deviceCountry = (devRows || cntRows) ? `<div class="two-col">
    ${devRows ? `<div class="card"><div class="card-head">
      <span class="card-tick" style="background:#0D9488"></span>
      <span class="card-title" style="color:#0F766E">Device Performance</span>
    </div><table class="tbl acc-teal"><thead><tr>
      <th class="al-left">Device</th><th class="al-right">Clicks</th><th class="al-right">Impressions</th>
    </tr></thead><tbody>${devRows}</tbody></table></div>` : ""}
    ${cntRows ? `<div class="card"><div class="card-head">
      <span class="card-tick" style="background:#0D9488"></span>
      <span class="card-title" style="color:#0F766E">Top Countries</span>
    </div><table class="tbl acc-teal"><thead><tr>
      <th class="al-left">Country</th><th class="al-right">Clicks</th><th class="al-right">Impressions</th>
    </tr></thead><tbody>${cntRows}</tbody></table></div>` : ""}
  </div>` : "";

  const qRows = d.topQueries.slice(0,12).map((q,i)=>`<tr>
    <td class="al-center"><span class="rank" style="background:#CCFBF1;color:#115E59">${i+1}</span></td>
    <td class="al-left"><span class="kw">${esc(q.query)}</span></td>
    <td class="al-right"><b>${nfmt(q.clicks)}</b></td>
    <td class="al-right">${nfmt(q.impressions)}</td>
    <td class="al-right">${(q.ctr*100).toFixed(1)}%</td>
    <td class="al-right">${q.position.toFixed(1)}</td>
  </tr>`).join("");
  const queries = d.topQueries.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#0D9488"></span>
    <span class="card-title" style="color:#0F766E">Top Queries</span>
  </div><table class="tbl acc-teal"><thead><tr>
    <th class="al-center" style="width:30px">#</th><th class="al-left">Query</th>
    <th class="al-right" style="width:52px">Clicks</th><th class="al-right" style="width:64px">Impr.</th>
    <th class="al-right" style="width:48px">CTR</th><th class="al-right" style="width:44px">Pos.</th>
  </tr></thead><tbody>${qRows}</tbody></table></div>` : "";

  const pRows = d.topPages.slice(0,10).map((p,i)=>{
    const path = p.page.replace(/^https?:\/\/[^/]+/,"") || "/";
    return `<tr>
      <td class="al-center"><span class="rank" style="background:#CCFBF1;color:#115E59">${i+1}</span></td>
      <td class="al-left"><span class="path">${esc(path)}</span></td>
      <td class="al-right"><b>${nfmt(p.clicks)}</b></td>
      <td class="al-right">${nfmt(p.impressions)}</td>
      <td class="al-right">${(p.ctr*100).toFixed(1)}%</td>
    </tr>`;
  }).join("");
  const pages = d.topPages.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#0D9488"></span>
    <span class="card-title" style="color:#0F766E">Top Pages</span>
  </div><table class="tbl acc-teal"><thead><tr>
    <th class="al-center" style="width:30px">#</th><th class="al-left">Page</th>
    <th class="al-right" style="width:52px">Clicks</th><th class="al-right" style="width:64px">Impr.</th>
    <th class="al-right" style="width:48px">CTR</th>
  </tr></thead><tbody>${pRows}</tbody></table></div>` : "";

  return `${sectionHead(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79l5 5 1.49-1.49-5-5zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>`,
    "#2DD4BF,#0D9488", "SEO Performance", "#99F6E4")}
    <div class="kpi-grid">${kpis}</div>
    ${channels}${bnb}${deviceCountry}${queries}${pages}
    ${aiCard("#F0FDFA","#99F6E4","#0F766E", d.aiAnalysis)}`;
}

function adsSection(d: UnifiedReportData["ads"]): string {
  if (!d) return "";
  const k = d.kpi;
  const blue = "#2563EB";
  const kpis = [
    kpiCard("Ad Spend", money(k.spend.cur), k.spend.cur, k.spend.prev, money(k.spend.prev), blue, true),
    kpiCard("Clicks", nfmt(k.clicks.cur), k.clicks.cur, k.clicks.prev, nfmt(k.clicks.prev), blue),
    kpiCard("Impressions", nfmt(k.impressions.cur), k.impressions.cur, k.impressions.prev, nfmt(k.impressions.prev), blue),
    kpiCard("Conversions", nfmt(Math.round(k.conversions.cur)), k.conversions.cur, k.conversions.prev, nfmt(Math.round(k.conversions.prev)), blue),
    kpiCard("CTR", `${(k.ctr.cur*100).toFixed(2)}%`, k.ctr.cur, k.ctr.prev, `${(k.ctr.prev*100).toFixed(2)}%`, blue),
    kpiCard("Avg. CPC", money(k.cpc.cur), k.cpc.cur, k.cpc.prev, money(k.cpc.prev), blue, true),
  ].join("");

  const clicksChart = d.daily.length > 1 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#2563EB"></span>
    <span class="card-title" style="color:#1D4ED8">Daily Clicks</span>
  </div>${lineChart(d.daily.map(x=>({label:format(new Date(x.date),"MMM d"), value:x.clicks})), "#2563EB", "gac")}</div>` : "";

  const spendChart = d.daily.length > 1 ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#2563EB"></span>
    <span class="card-title" style="color:#1D4ED8">Daily Ad Spend</span>
  </div>${lineChart(d.daily.map(x=>({label:format(new Date(x.date),"MMM d"), value:x.cost})), "#60A5FA", "gas")}</div>` : "";

  const top = [...d.campaigns].sort((a,b)=>b.cost - a.cost).slice(0,8);
  const campaignChart = top.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#2563EB"></span>
    <span class="card-title" style="color:#1D4ED8">Top Campaigns by Spend</span>
  </div>${barChart(top.map(c=>({label:c.name, value:c.cost})), ["#60A5FA","#2563EB"], "gcb")}</div>` : "";

  const cRows = [...d.campaigns].sort((a,b)=>b.cost - a.cost).slice(0,10).map((c,i)=>{
    const ctr = c.impressions>0 ? `${((c.clicks/c.impressions)*100).toFixed(1)}%` : "—";
    const cpc = c.clicks>0 ? money(c.cost/c.clicks) : "—";
    return `<tr>
      <td class="al-center"><span class="rank" style="background:#DBEAFE;color:#1E40AF">${i+1}</span></td>
      <td class="al-left"><b>${esc(c.name)}</b></td>
      <td class="al-right">${money(c.cost)}</td>
      <td class="al-right">${nfmt(c.clicks)}</td>
      <td class="al-right">${nfmt(c.impressions)}</td>
      <td class="al-right">${ctr}</td>
      <td class="al-right">${cpc}</td>
    </tr>`;
  }).join("");
  const campaignTable = d.campaigns.length ? `<div class="card"><div class="card-head">
    <span class="card-tick" style="background:#2563EB"></span>
    <span class="card-title" style="color:#1D4ED8">Campaign Performance</span>
  </div><table class="tbl acc-blue"><thead><tr>
    <th class="al-center" style="width:30px">#</th><th class="al-left">Campaign</th>
    <th class="al-right" style="width:64px">Spend</th><th class="al-right" style="width:52px">Clicks</th>
    <th class="al-right" style="width:64px">Impr.</th><th class="al-right" style="width:48px">CTR</th>
    <th class="al-right" style="width:52px">CPC</th>
  </tr></thead><tbody>${cRows}</tbody></table></div>` : "";

  return `${sectionHead(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M18 11V3H2v14h14v-2h2l4-4-4-4zM4 15V5h12v10z"/></svg>`,
    "#60A5FA,#2563EB", "Google Ads", "#BFDBFE")}
    <div class="kpi-grid">${kpis}</div>
    ${clicksChart}${spendChart}${campaignChart}${campaignTable}
    ${aiCard("#EFF6FF","#BFDBFE","#1E40AF", d.aiAnalysis)}`;
}

function socialSection(d: UnifiedReportData["social"]): string {
  if (!d) return "";
  const purple = "#9333EA";
  const mini = (label:string, v:number|string) => `<div class="mini">
    <div class="mini-label">${esc(label)}</div><div class="mini-value">${typeof v==="number"?nfmt(v):esc(v)}</div>
  </div>`;

  const fb = d.facebook ? `<div class="sub-head"><span class="sub-dot" style="background:#9333EA"></span>Facebook</div>
    <div class="mini-grid">
      ${mini("Page Likes", d.facebook.likes)}
      ${mini("Followers", d.facebook.followers)}
      ${mini("Reach (28d)", d.facebook.reach)}
      ${mini("Engagement (28d)", d.facebook.engagement)}
      ${mini("Page Views", d.facebook.page_views)}
      ${mini("Video Views", d.facebook.video_views)}
      ${mini("New Fans", d.facebook.fan_adds)}
      ${mini("—", "")}
    </div>
    <div class="card"><div class="card-head">
      <span class="card-tick" style="background:#9333EA"></span>
      <span class="card-title" style="color:#6B21A8">Facebook · 28-Day Activity</span>
    </div>${barChart([
      {label:"Reach", value:d.facebook.reach},
      {label:"Engagement", value:d.facebook.engagement},
      {label:"Page Views", value:d.facebook.page_views},
      {label:"Video Views", value:d.facebook.video_views},
      {label:"New Fans", value:d.facebook.fan_adds},
    ], ["#C084FC","#9333EA"], "gfb")}</div>` : "";

  const ig = d.instagram ? `<div class="sub-head"><span class="sub-dot" style="background:#9333EA"></span>Instagram${d.instagram.username?` · @${esc(d.instagram.username)}`:""}</div>
    <div class="mini-grid">
      ${mini("Followers", d.instagram.followers)}
      ${mini("Posts", d.instagram.media_count)}
      ${mini("Reach", d.instagram.reach)}
      ${mini("Engagement Rate", `${d.instagram.engagement_rate ?? 0}%`)}
      ${mini("Profile Views", d.instagram.profile_views)}
      ${mini("Website Clicks", d.instagram.website_clicks)}
      ${mini("Interactions", d.instagram.total_interactions)}
      ${mini("Saves", d.instagram.saves)}
    </div>
    <div class="card"><div class="card-head">
      <span class="card-tick" style="background:#9333EA"></span>
      <span class="card-title" style="color:#6B21A8">Instagram · Engagement</span>
    </div>${barChart([
      {label:"Reach", value:d.instagram.reach},
      {label:"Interactions", value:d.instagram.total_interactions},
      {label:"Profile Views", value:d.instagram.profile_views},
      {label:"Website Clicks", value:d.instagram.website_clicks},
      {label:"Saves", value:d.instagram.saves},
    ], ["#C084FC","#9333EA"], "gig")}</div>` : "";

  return `${sectionHead(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M18 8a3 3 0 10-2.83-4H8.83a3 3 0 100 4A3 3 0 0018 8zM6 12a3 3 0 100 6 3 3 0 000-6zm12 4a3 3 0 10-2.83 4H8.83A3 3 0 106 16h12z"/></svg>`,
    "#C084FC,#9333EA", "Social Media", "#E9D5FF")}
    ${fb}${ig}
    ${aiCard("#FAF5FF","#E9D5FF","#6B21A8", d.aiAnalysis)}`;
}

// ─── main ─────────────────────────────────────────────────────────
const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html{font-size:10px}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;color:#1E293B;font-size:10px;line-height:1.5;background:#fff;padding:24px;font-feature-settings:'tnum' 1}
b{font-weight:600;color:#0F172A}
.masthead{position:relative;overflow:hidden;background:linear-gradient(120deg,#0B1220 0%,#131C33 60%,#182240 100%);border-radius:16px;padding:26px 28px;display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:20px}
.mh-glow{position:absolute;right:-70px;top:-90px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(96,165,250,.18) 0%,rgba(96,165,250,0) 70%)}
.mh-left{position:relative;z-index:1;flex:1;min-width:0}
.mh-right{position:relative;z-index:1;flex:0 0 auto;display:flex;align-items:center;justify-content:flex-end}
.mh-logo{height:52px;width:auto;display:block;object-fit:contain}
.mh-eyebrow{font-size:7.5px;font-weight:700;letter-spacing:2px;color:#94A3B8;margin-bottom:10px;display:flex;align-items:center}
.mh-eyebrow .dot{width:5px;height:5px;border-radius:50%;display:inline-block;margin-right:3px}
.mh-title{font-size:25px;font-weight:800;color:#fff;letter-spacing:-.5px;margin-bottom:4px}
.mh-client{font-size:12.5px;font-weight:600;color:#C7D2E4;margin-bottom:12px}
.mh-period{display:inline-block;font-size:9px;font-weight:600;color:#DBE4F5;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:4px 12px;background:rgba(255,255,255,.05)}
.sec-head{display:flex;align-items:center;margin:4px 0 12px}
.sec-icon{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;box-shadow:0 2px 5px rgba(15,23,42,.18)}
.sec-title{font-size:16.5px;font-weight:800;color:#0F172A;letter-spacing:-.3px;white-space:nowrap}
.sec-rule{flex:1;height:2px;border-radius:2px;margin-left:14px}
.sub-head{font-size:11px;font-weight:800;letter-spacing:.2px;margin:14px 0 8px;display:flex;align-items:center}
.sub-dot{width:7px;height:7px;border-radius:2.5px;margin-right:7px;display:inline-block}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.kpi{border:1px solid #E7EAF0;border-top:2.5px solid;border-radius:10px;padding:9px 12px 8px;background:#fff;break-inside:avoid}
.kpi-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.kpi-label{font-size:7.6px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748B}
.kpi-value{font-size:19px;font-weight:800;color:#0F172A;letter-spacing:-.4px;line-height:1.15}
.kpi-prev{font-size:8.2px;color:#94A3B8;font-weight:500;margin-top:2px}
.pill{display:inline-flex;align-items:center;border-radius:999px;padding:1.5px 7px;font-size:8.2px;font-weight:700;white-space:nowrap}
.pill .arr{margin-right:3.5px}
.pill-pos{color:#047857;background:#ECFDF5;border:1px solid #A7F3D0}
.pill-neg{color:#B91C1C;background:#FEF2F2;border:1px solid #FECACA}
.pill-flat{color:#64748B;background:#F1F5F9;border:1px solid #E2E8F0;padding:1.5px 9px}
.card{border:1px solid #E7EAF0;border-radius:12px;padding:12px 14px;margin-bottom:12px;background:#fff;break-inside:avoid}
.card-head{display:flex;align-items:baseline;margin-bottom:9px}
.card-tick{width:7px;height:7px;border-radius:2.5px;margin-right:7px;align-self:center}
.card-title{font-size:10.5px;font-weight:800;letter-spacing:.2px}
.card-sub{font-size:8.5px;color:#94A3B8;font-weight:500;margin-left:8px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.two-col .card{margin-bottom:12px}
.tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:9.6px}
.tbl th{font-size:7.4px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;padding:6px 9px;text-align:left}
.tbl td{padding:5.5px 9px;border-top:1px solid #F1F5F9;color:#334155;vertical-align:top}
.tbl tbody tr:nth-child(even) td{background:#FAFBFD}
.tbl .al-right{text-align:right}.tbl .al-center{text-align:center}.tbl .al-left{text-align:left}
.acc-orange th{color:#9A3412;background:#FFF7ED;border-bottom:1.5px solid #FED7AA}
.acc-teal th{color:#115E59;background:#F0FDFA;border-bottom:1.5px solid #99F6E4}
.acc-blue th{color:#1E40AF;background:#EFF6FF;border-bottom:1.5px solid #BFDBFE}
.acc-purple th{color:#6B21A8;background:#FAF5FF;border-bottom:1.5px solid #E9D5FF}
.tbl th:first-child{border-top-left-radius:7px}.tbl th:last-child{border-top-right-radius:7px}
.rank{display:inline-flex;width:15px;height:15px;border-radius:50%;align-items:center;justify-content:center;font-size:7.8px;font-weight:700}
.path{font-weight:500;color:#0F172A;word-break:break-all}
.kw{color:#475569}
.cc{display:inline-block;border-radius:5px;padding:1.5px 6px;font-size:8.2px;font-weight:700;letter-spacing:.4px}
.barlist{display:flex;flex-direction:column;gap:7px}
.bl-row{display:grid;grid-template-columns:64px 1fr 54px 46px;gap:10px;align-items:center}
.bl-label{font-size:9.6px;font-weight:600;color:#0F172A}
.bl-track{height:9px;border-radius:5px;background:#F1F5F9;overflow:hidden}
.bl-fill{height:100%;border-radius:5px;min-width:3px}
.bl-val{font-size:9.6px;font-weight:700;color:#0F172A;text-align:right}
.bl-share{font-size:9px;color:#64748B;text-align:right}
.chart{width:100%;height:auto;display:block}
.ax{font-family:'Inter',system-ui,sans-serif;font-size:8px;fill:#94A3B8;font-weight:500}
.lg{font-family:'Inter',system-ui,sans-serif;font-size:8.6px;fill:#334155;font-weight:600}
.ai-card{border:1px solid;border-radius:12px;padding:12px 14px;margin-bottom:12px;break-inside:avoid}
.ai-head{display:flex;align-items:center;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:7px}
.ai-card p{font-size:9.4px;line-height:1.62;color:#334155;margin-bottom:6px}
.ai-card p:last-child{margin-bottom:0}
.mini-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.mini{border:1px solid #E7EAF0;border-radius:9px;padding:8px 10px;background:#fff}
.mini-label{font-size:7.4px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748B;margin-bottom:3px}
.mini-value{font-size:14.5px;font-weight:800;color:#0F172A;letter-spacing:-.3px}
.pagebreak{break-before:page;height:0}
@page{size:A4;margin:12mm}
@media print{body{padding:0}}
`;

let cachedLogoDataUrl: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch(vsaLogoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => { cachedLogoDataUrl = fr.result as string; resolve(cachedLogoDataUrl); };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function buildUnifiedReportHTML(d: UnifiedReportData): Promise<string> {
  const logoDataUrl = await loadLogoDataUrl();
  const sections: string[] = [];
  sections.push(`<div class="masthead">
    <div class="mh-glow"></div>
    <div class="mh-left">
      <div class="mh-eyebrow">
        <span class="dot" style="background:#FB923C"></span>
        <span class="dot" style="background:#2DD4BF"></span>
        <span class="dot" style="background:#60A5FA"></span>
        <span class="dot" style="background:#C084FC"></span>
        &nbsp;MONTHLY REPORT
      </div>
      <div class="mh-title">Unified Performance Report</div>
      <div class="mh-client">${esc(d.clinicName)}</div>
      <div class="mh-period">${esc(d.periodLabel)}</div>
    </div>
    ${logoDataUrl ? `<div class="mh-right"><img class="mh-logo" src="${logoDataUrl}" alt="VSA Vet Media" /></div>` : ""}
  </div>`);

  if (d.website) sections.push(websiteSection(d.website, d.timezone));
  if (d.seo)     sections.push(`<div class="pagebreak"></div>${seoSection(d.seo)}`);
  if (d.ads)     sections.push(`<div class="pagebreak"></div>${adsSection(d.ads)}`);
  if (d.social)  sections.push(`<div class="pagebreak"></div>${socialSection(d.social)}`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Unified Performance Report — ${esc(d.clinicName)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>${BASE_CSS}</style>
  </head><body>${sections.join("")}</body></html>`;
}

/**
 * Print the report from a blank window so the browser's default print header
 * shows "about:blank" instead of the app URL. Users can still uncheck
 * "Headers and footers" in the print dialog to remove it entirely.
 */
export function printReportHTML(html: string): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) {
    // Popup blocked — fall back to hidden iframe
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      finally { setTimeout(() => document.body.removeChild(iframe), 1500); }
    }, 700);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try { win.focus(); win.print(); } catch { /* ignore */ }
  };
  // Wait for fonts + logo to lay out before printing
  setTimeout(trigger, 900);
}
