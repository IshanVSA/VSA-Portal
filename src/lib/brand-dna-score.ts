// Compute the DNA Profile score the same way the Brand DNA tab displays it:
// - Use synthesized completeness_score when available (>0)
// - Otherwise fall back to the questionnaire answered count out of 10 questions
//
// Keep the question key list in sync with QUESTIONS in BrandDNAForm.tsx and
// REQUIRED_Q_KEYS in src/hooks/useBrandDNA.ts.

const REQUIRED_Q_KEYS = [
  "q1_differentiator",
  "q2_myth",
  "q3_target_client",
  "q4_founding_story",
  "q5_owner_presence",
  "q6_growth_priority",
  "q7_content_exclusions",
  "q8_community_connections",
  "q9_patient_consent",
  "q10_stat_holidays",
];

export interface BrandDNALikeRow {
  completeness_score?: number | null;
  call_notes?: Record<string, any> | null;
}

export function computeBrandDNAScore(dna: BrandDNALikeRow | null | undefined): number {
  if (!dna) return 0;
  if (dna.completeness_score && dna.completeness_score > 0) {
    return Math.round(dna.completeness_score);
  }
  const notes = (dna.call_notes ?? {}) as Record<string, any>;
  const answered = REQUIRED_Q_KEYS.filter(
    (k) => notes[k] !== undefined && String(notes[k]).trim() !== ""
  ).length;
  return Math.round((answered / REQUIRED_Q_KEYS.length) * 100);
}
