import DOMPurify from "dompurify";

/**
 * Convert a blog draft (loose markdown-ish text produced by the writer agent)
 * into readable HTML for the Human Gate reviewer.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  let s = escapeHtml(text);
  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic *x* (avoid matching ** already handled)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // inline code `x`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

export function draftToHtml(raw: string): string {
  if (!raw) return "";
  // Normalize and split off common section separators like "=== SCHEMA ===" so
  // the writer's raw JSON schema blocks render as collapsible code, not as prose.
  const normalized = raw.replace(/\r\n/g, "\n");
  const sectionRe = /^\s*={2,}\s*([A-Z][A-Z0-9 _-]{1,40})\s*={2,}\s*$/gm;
  const parts: { title: string | null; body: string }[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let currentTitle: string | null = null;
  while ((m = sectionRe.exec(normalized)) !== null) {
    parts.push({ title: currentTitle, body: normalized.slice(lastIdx, m.index) });
    currentTitle = m[1].trim();
    lastIdx = m.index + m[0].length;
  }
  parts.push({ title: currentTitle, body: normalized.slice(lastIdx) });

  const renderMain = (text: string) => renderMarkdown(text);
  const renderCodeSection = (title: string, text: string) => {
    // Extract fenced ```json ... ``` or ` ```json ... ``` ` variants, plus bare JSON objects.
    const chunks: { lang: string; code: string }[] = [];
    const fenceRe = /```(\w+)?\n?([\s\S]*?)```/g;
    let fm: RegExpExecArray | null;
    let matched = false;
    while ((fm = fenceRe.exec(text)) !== null) {
      matched = true;
      chunks.push({ lang: fm[1] || "", code: fm[2].trim() });
    }
    if (!matched) {
      // Try to split concatenated JSON objects heuristically
      const trimmed = text.trim();
      if (trimmed.startsWith("{")) {
        chunks.push({ lang: "json", code: trimmed });
      } else {
        chunks.push({ lang: "", code: trimmed });
      }
    }
    const blocks = chunks
      .map(({ lang, code }) => {
        let pretty = code;
        if (/^json$/i.test(lang) || code.trim().startsWith("{")) {
          try { pretty = JSON.stringify(JSON.parse(code), null, 2); } catch { /* keep raw */ }
        }
        return `<pre class="bg-muted/50 border rounded p-2 overflow-auto text-[11px]"><code>${escapeHtml(pretty)}</code></pre>`;
      })
      .join("\n");
    return `<details class="my-3 border rounded p-2"><summary class="text-xs font-medium cursor-pointer text-muted-foreground">${escapeHtml(title)} (${chunks.length} block${chunks.length === 1 ? "" : "s"})</summary>${blocks}</details>`;
  };

  const html = parts
    .map((p) => (p.title ? renderCodeSection(p.title, p.body) : renderMain(p.body)))
    .join("\n");

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h1","h2","h3","h4","h5","h6","p","strong","em","a","br","hr","ul","ol","li","code","blockquote","pre","details","summary","div"],
    ALLOWED_ATTR: ["href","target","rel","class"],
  });
}

function renderMarkdown(raw: string): string {
  const lines = raw.split("\n");

  const out: string[] = [];
  let paraBuf: string[] = [];
  let inList: "ul" | "ol" | null = null;

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${inline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push("<hr />");
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; }
      out.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeList();
    paraBuf.push(trimmed);
  }
  flushPara();
  closeList();

  return out.join("\n");
}

