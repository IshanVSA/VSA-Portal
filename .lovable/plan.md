

## Plan: Fix Brand DNA collection form not showing for additional clinics

### The bug

In `useBrandDNA.ts`, the form gate uses:
```ts
const isCompleted = dna?.status === "completed" || dna?.status === "synthesized";
```

But `status` is flipped to `synthesized` automatically by the AI pipeline (website extraction → synthesis) the moment a clinic is created — even before the **client** ever opens the questionnaire. Confirmed in the DB: clinics `62ecb5aa…` and `9b737aa6…` have `status='synthesized'` with **empty `call_notes`** (zero Q&A answers).

Result: when a client switches to a different clinic of theirs, `SocialMedia.tsx` evaluates `showDNAGate = isClient && !dnaCompleted` → `dnaCompleted` is wrongly `true` → form is hidden, client lands on the regular Social Media tabs without ever filling Layer 3.

### The fix

Change the "is the client done with their questionnaire?" check to look at **whether the client actually answered the Layer 3 questions**, not at the AI-driven `status` field.

**`src/hooks/useBrandDNA.ts`** — replace the `isCompleted` derivation:

```ts
// Q&A keys the client must fill (matches QUESTIONS in BrandDNAForm.tsx)
const REQUIRED_Q_KEYS = [
  "q1_differentiator","q2_myth","q3_target_client","q4_founding_story",
  "q5_owner_presence","q6_growth_priority","q7_content_exclusions",
  "q8_community_connections","q9_patient_consent","q10_stat_holidays",
];

const callNotes = (dna?.call_notes ?? {}) as Record<string, any>;
const answeredCount = REQUIRED_Q_KEYS.filter(
  k => callNotes[k] !== undefined && String(callNotes[k]).trim() !== ""
).length;

// Client-side completion = they actually answered the questionnaire,
// OR a staff member explicitly marked the record completed/active.
const isCompleted =
  answeredCount >= REQUIRED_Q_KEYS.length ||
  dna?.status === "completed" ||
  dna?.status === "active";
```

Notes:
- Drop `'synthesized'` from the auto-pass list — that status only means the AI pipeline ran, not that the client submitted.
- Keep `'completed'` (set by the form's submit handler) and `'active'` (set when a staff member activates the profile) as overrides so existing fully-filled clinics aren't re-prompted.

### Why this works

- Clinic A (form already filled): `call_notes` contains all 10 answers → `isCompleted = true` → no gate.
- Clinic B (new, AI extracted website only): `call_notes` is empty → `isCompleted = false` → form appears.
- Existing fully-onboarded clinics with `status='active'`: still treated as completed.

### Backfill (no migration needed)

No SQL change required. The two clinics currently stuck (`62ecb5aa…`, `9b737aa6…`) will automatically begin showing the form to their client owners on next visit because their `call_notes` is empty.

### Files touched

- `src/hooks/useBrandDNA.ts` — only the `isCompleted` derivation changes (~10 lines).

No edge function, schema, or other component changes.

