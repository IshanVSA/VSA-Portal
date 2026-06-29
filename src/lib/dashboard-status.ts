// Shared helpers for dashboard status & platform color mapping.
// Tweak in one place to update both client dashboard & department status strip.

export const IN_PROGRESS_POST_STATUSES = [
  "draft",
  "generated",
  "queued",
  "processing",
  "synthesized",
  "retrying",
] as const;

export const TO_REVIEW_GEN_STATUSES = [
  "sent_for_copy_review",
  "sent_for_final_review",
] as const;

export const PUBLISHED_POST_STATUSES = [
  "published",
  "active",
  "completed",
] as const;

export type PlatformColor = "blue" | "pink" | "teal";

export function platformColor(platform: string | null | undefined): PlatformColor {
  const p = (platform || "").toLowerCase();
  if (p.includes("instagram")) return "pink";
  if (p.includes("gbp") || p.includes("google") || p.includes("business")) return "teal";
  return "blue";
}

export const PLATFORM_DOT_BG: Record<PlatformColor, string> = {
  blue: "bg-blue-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
};

export const PLATFORM_BORDER: Record<PlatformColor, string> = {
  blue: "border-l-blue-500",
  pink: "border-l-pink-500",
  teal: "border-l-teal-500",
};

export function platformLabel(platform: string | null | undefined): string {
  const c = platformColor(platform);
  if (c === "pink") return "Instagram";
  if (c === "teal") return "Google Business";
  return "Facebook";
}
