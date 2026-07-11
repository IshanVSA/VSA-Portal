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
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
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

  return DOMPurify.sanitize(out.join("\n"), {
    ALLOWED_TAGS: ["h1","h2","h3","h4","h5","h6","p","strong","em","a","br","hr","ul","ol","li","code","blockquote"],
    ALLOWED_ATTR: ["href","target","rel"],
  });
}
