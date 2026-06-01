import type { SM2Post } from "@/hooks/useSM2Posts";

// Per-post confidence heuristic. Mirrors the batch-level reviewer signals but
// applied to a single post so concierges can pinpoint which post(s) dragged
// the overall confidence score down instead of regenerating the whole batch.

const BANNED_WORDS = [
  "best",
  "guaranteed",
  "guarantee",
  "cure",
  "cures",
  "miracle",
  "#1",
  "number one",
  "cheapest",
  "specialist",
  "specialists",
  "painless",
  "risk-free",
  "100%",
];

// Broad emoji range — matches most pictographs/symbols/emoticons.
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const EM_DASH_RE = /[—–]/; // em-dash and en-dash both banned by SM2 style

export interface PostConfidence {
  score: number; // 0–100
  issues: string[];
}

export function computePostConfidence(post: SM2Post): PostConfidence {
  const issues: string[] = [];
  let score = 100;

  const textParts = [post.caption, post.hook, post.hook_b, post.cta]
    .filter((s): s is string => !!s)
    .join("\n");

  if (EMOJI_RE.test(textParts)) {
    score -= 15;
    issues.push("Emoji detected (zero-emoji policy)");
  }
  if (EM_DASH_RE.test(textParts)) {
    score -= 10;
    issues.push("Em-dash or en-dash detected");
  }

  const lower = textParts.toLowerCase();
  const hits = BANNED_WORDS.filter((w) =>
    new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(lower)
  );
  if (hits.length) {
    score -= Math.min(45, hits.length * 15);
    issues.push(`Banned/risky term${hits.length > 1 ? "s" : ""}: ${hits.join(", ")}`);
  }

  if (post.compliance_notes && post.compliance_notes.trim().length > 0) {
    score -= 10;
    issues.push("Compliance note flagged by fact-checker");
  }

  if (post.status && post.status.toUpperCase() === "FAIL") {
    score -= 25;
    issues.push("Fact-check status: FAIL");
  } else if (post.status && !["PASS", "OK"].includes(post.status.toUpperCase())) {
    score -= 10;
    issues.push(`Fact-check status: ${post.status}`);
  }

  if (!post.caption || post.caption.trim().length < 20) {
    score -= 15;
    issues.push("Caption missing or too short");
  }
  if (!post.hook || post.hook.trim().length < 5) {
    score -= 10;
    issues.push("Hook missing");
  }

  score = Math.max(0, Math.min(100, score));
  return { score, issues };
}

export function confidenceTone(score: number): "good" | "warn" | "bad" {
  if (score >= 90) return "good";
  if (score >= 70) return "warn";
  return "bad";
}

export function confidenceBadgeClass(score: number): string {
  const tone = confidenceTone(score);
  if (tone === "good") return "bg-success/15 text-success border-success/30";
  if (tone === "warn") return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}
