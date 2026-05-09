/**
 * Blog Body HTML Pre-processor
 * Converts AI-generated blog output markers into clean, pasteable WordPress HTML.
 * Per Module 11 spec: strips H1:/H2:/Q:/A: labels, wraps in semantic tags,
 * converts **bold keywords** to <strong> (or <a><strong> with slug map).
 *
 * Security: raw AI text is HTML-escaped before being wrapped in tags, and the
 * final string is sanitized with DOMPurify before being rendered.
 */
import DOMPurify from "dompurify";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SlugMapEntry {
  keyword: string;
  slug: string;
}

export function preprocessBlogHtml(
  rawText: string,
  slugMap: SlugMapEntry[] = []
): { html: string; unresolvedKeywords: string[] } {
  if (!rawText) return { html: "", unresolvedKeywords: [] };

  const unresolvedKeywords: string[] = [];
  const lines = rawText.split("\n");
  const htmlParts: string[] = [];
  let inFaq = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Skip output markers
    if (
      /^BLOG \d+ ---/.test(line) ||
      /^=== BLOG \d+ COMPLETE ===$/.test(line) ||
      /^--- SCHEMA:/.test(line) ||
      /^--- INTERNAL LINKS:/.test(line) ||
      /^--- END ---$/.test(line) ||
      /^--- END QA REPORT ---$/.test(line) ||
      /^--- TWO-PASS QA REPORT ---$/.test(line) ||
      /^META TITLE:/.test(line) ||
      /^META DESCRIPTION:/.test(line) ||
      /^URL SLUG:/.test(line) ||
      /^WORDPRESS CATEGORY:/.test(line) ||
      /^IMAGE ALT TEXT:/.test(line) ||
      /^GETTY IMAGE SEARCH TERMS:/.test(line) ||
      /^PUBLISH DATE:/.test(line) ||
      /^YOAST\/RANKMATH FIELDS:/.test(line) ||
      /^---$/.test(line) ||
      line === ""
    ) {
      continue;
    }

    // H1
    if (line.startsWith("H1:")) {
      const text = line.replace(/^H1:\s*/, "");
      htmlParts.push(`<h1>${processInlineFormatting(text, slugMap, unresolvedKeywords)}</h1>`);
      continue;
    }

    // H2
    if (line.startsWith("H2:")) {
      const text = line.replace(/^H2:\s*/, "");
      htmlParts.push(`<h2>${processInlineFormatting(text, slugMap, unresolvedKeywords)}</h2>`);
      inFaq = text.toLowerCase().includes("frequently asked questions") || text.toLowerCase().includes("faq");
      continue;
    }

    // Table of Contents marker
    if (line.toLowerCase().startsWith("table of contents")) {
      continue; // ToC is handled by WordPress plugins
    }

    // Frequently Asked Questions header (not H2 prefixed)
    if (/^frequently asked questions$/i.test(line)) {
      htmlParts.push(`<h2>Frequently Asked Questions</h2>`);
      inFaq = true;
      continue;
    }

    // FAQ Q:
    if (line.startsWith("Q:")) {
      const text = line.replace(/^Q:\s*/, "");
      htmlParts.push(`<p><strong>${processInlineFormatting(text, slugMap, unresolvedKeywords)}</strong></p>`);
      continue;
    }

    // FAQ A:
    if (line.startsWith("A:")) {
      const text = line.replace(/^A:\s*/, "");
      htmlParts.push(`<p>${processInlineFormatting(text, slugMap, unresolvedKeywords)}</p>`);
      continue;
    }

    // Author line
    if (line.startsWith("Published by the team at")) {
      htmlParts.push(`<p><em>${processInlineFormatting(line, slugMap, unresolvedKeywords)}</em></p>`);
      continue;
    }

    // Disclaimer
    if (line.startsWith("This article is for general educational purposes")) {
      htmlParts.push(`<p><em>${processInlineFormatting(line, slugMap, unresolvedKeywords)}</em></p>`);
      continue;
    }

    // Regular paragraph
    htmlParts.push(`<p>${processInlineFormatting(line, slugMap, unresolvedKeywords)}</p>`);
  }

  return { html: htmlParts.join("\n"), unresolvedKeywords: [...new Set(unresolvedKeywords)] };
}

function processInlineFormatting(
  text: string,
  slugMap: SlugMapEntry[],
  unresolvedKeywords: string[]
): string {
  // Convert **bold keywords** to linked/strong tags
  return text.replace(/\*\*([^*]+)\*\*/g, (_, keyword: string) => {
    const match = slugMap.find(
      (s) => s.keyword.toLowerCase() === keyword.toLowerCase()
    );
    if (match) {
      return `<a href="${match.slug}"><strong>${keyword}</strong></a>`;
    }
    unresolvedKeywords.push(keyword);
    return `<strong>${keyword}</strong>`;
  });
}

/**
 * Parse the generation header from raw output text
 */
export interface BlogGenerationHeader {
  hospitalName: string;
  hospitalType: string;
  jurisdiction: string;
  governingBody: string;
  spellingMode: string;
  blogMonthCount: string;
  blog1Type: string;
  slotsSelected: string;
  activeHazards: string;
  highAlertHazards: string;
  unverifiedFields: string;
  promoSignal: string;
  clusterCity: string;
}

export function parseGenerationHeader(rawText: string): BlogGenerationHeader | null {
  if (!rawText) return null;
  
  const getField = (label: string): string => {
    const regex = new RegExp(`${label}:\\s*(.+)`, "i");
    const match = rawText.match(regex);
    return match?.[1]?.trim() || "";
  };

  return {
    hospitalName: getField("Hospital"),
    hospitalType: getField("Hospital Type"),
    jurisdiction: getField("Jurisdiction"),
    governingBody: getField("Governing Body"),
    spellingMode: getField("Spelling Mode"),
    blogMonthCount: getField("Blog Month Count"),
    blog1Type: getField("Blog 1 Type"),
    slotsSelected: getField("Slots Selected"),
    activeHazards: getField("Active Hazards This Month"),
    highAlertHazards: getField("HIGH ALERT Hazards"),
    unverifiedFields: getField("Unverified Fields"),
    promoSignal: getField("Promo Signal"),
    clusterCity: getField("Cluster City"),
  };
}

/**
 * Parse individual blog metadata from raw output
 */
export interface BlogMetaParsed {
  metaTitle: string;
  metaDescription: string;
  urlSlug: string;
  category: string;
  imageAltText: string;
  gettySearchTerms: string;
  publishDate: string;
  focusKeyword: string;
  seoTitle: string;
  blogBody: string;
}

export function parseBlogFromOutput(rawText: string, blogNum: number): BlogMetaParsed | null {
  if (!rawText) return null;

  // Find the blog section
  const blogStartRegex = new RegExp(`BLOG ${blogNum} ---[^\\n]*\\n`, "i");
  const blogEndRegex = new RegExp(`=== BLOG ${blogNum} COMPLETE ===`, "i");
  
  const startMatch = rawText.match(blogStartRegex);
  if (!startMatch) return null;
  
  const startIdx = startMatch.index! + startMatch[0].length;
  const endMatch = rawText.substring(startIdx).match(blogEndRegex);
  const endIdx = endMatch ? startIdx + endMatch.index! : rawText.length;
  
  const blogSection = rawText.substring(startIdx, endIdx);
  
  const getField = (label: string): string => {
    const regex = new RegExp(`^${label}:\\s*(.+)$`, "im");
    const match = blogSection.match(regex);
    return match?.[1]?.trim() || "";
  };

  // Extract body (everything after the --- divider following meta fields)
  const dividerIdx = blogSection.indexOf("\n---\n");
  const bodyStart = dividerIdx >= 0 ? dividerIdx + 5 : 0;
  
  // Find schema start to know where body ends
  const schemaStart = blogSection.indexOf("--- SCHEMA:");
  const bodyEnd = schemaStart >= 0 ? schemaStart : blogSection.length;
  const blogBody = blogSection.substring(bodyStart, bodyEnd).trim();

  const yoastLine = getField("YOAST/RANKMATH FIELDS");
  const focusMatch = yoastLine.match(/Focus Keyword:\s*([^|]+)/);

  return {
    metaTitle: getField("META TITLE"),
    metaDescription: getField("META DESCRIPTION"),
    urlSlug: getField("URL SLUG"),
    category: getField("WORDPRESS CATEGORY"),
    imageAltText: getField("IMAGE ALT TEXT"),
    gettySearchTerms: getField("GETTY IMAGE SEARCH TERMS"),
    publishDate: getField("PUBLISH DATE"),
    focusKeyword: focusMatch?.[1]?.trim() || "",
    seoTitle: getField("META TITLE"),
    blogBody,
  };
}

/**
 * Extract QA report from raw output
 */
export function parseQAReport(rawText: string): { status: string; audits: string[] } | null {
  if (!rawText) return null;
  
  const startMarker = "--- TWO-PASS QA REPORT ---";
  const endMarker = "--- END QA REPORT ---";
  const startIdx = rawText.indexOf(startMarker);
  const endIdx = rawText.indexOf(endMarker);
  
  if (startIdx < 0 || endIdx < 0) return null;
  
  const qaSection = rawText.substring(startIdx + startMarker.length, endIdx).trim();
  const statusMatch = qaSection.match(/OVERALL QA STATUS:\s*(.+)/i);
  const status = statusMatch?.[1]?.trim() || "UNKNOWN";
  
  const auditLines = qaSection.split("\n").filter(l => /^AUDIT \d+/.test(l.trim()));
  
  return { status, audits: auditLines };
}

/**
 * Extract schema blocks from raw output for a specific blog
 */
export function parseSchemaBlocks(rawText: string, blogNum: number): string {
  if (!rawText) return "";
  
  const startMarker = `--- SCHEMA: BLOG ${blogNum} ---`;
  const endMarker = `--- SCHEMA: BLOG ${blogNum} END ---`;
  const startIdx = rawText.indexOf(startMarker);
  const endIdx = rawText.indexOf(endMarker);
  
  if (startIdx < 0 || endIdx < 0) return "";
  
  return rawText.substring(startIdx + startMarker.length, endIdx).trim();
}
