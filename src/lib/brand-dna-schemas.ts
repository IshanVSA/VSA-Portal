/**
 * Lightweight schema validators for Brand DNA sub-objects.
 *
 * Each validator inspects a parsed JSON object and returns a list of
 * human-readable error messages (empty = valid). The goal is to catch the
 * most common manual-edit mistakes (typos in field names, wrong primitive
 * types, out-of-range numbers, invalid enum values, malformed nested arrays)
 * before the value is written back to Supabase.
 *
 * These are intentionally permissive about *extra* keys — we only flag
 * unknown keys as warnings (kept distinct from blocking errors) so future
 * fields added by the AI synthesis pipeline don't break manual edits.
 */

export type ValidationLevel = "error" | "warning";
export interface ValidationIssue {
  level: ValidationLevel;
  path: string;
  message: string;
}

type Primitive = "string" | "number" | "integer" | "boolean";
type FieldSpec =
  | { type: Primitive; required?: boolean; enum?: readonly (string | number)[]; min?: number; max?: number; pattern?: RegExp }
  | { type: "string[]"; required?: boolean; minLength?: number }
  | { type: "object[]"; required?: boolean; itemSchema: Record<string, FieldSpec> }
  | { type: "object"; required?: boolean; schema: Record<string, FieldSpec> };

interface SectionSchema {
  fields: Record<string, FieldSpec>;
  /** Field names that must be present even if empty. */
  required?: string[];
}

/* ── Schemas ───────────────────────────────────────────────────────────── */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

const WEBSITE_EXTRACTION: SectionSchema = {
  fields: {
    hospital_name: { type: "string" },
    phone: { type: "string" },
    hours: { type: "string" },
    founding_year: { type: "integer", min: 1800, max: 2100 },
    booking_url: { type: "string", pattern: /^https?:\/\//i },
    about_us_content: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    extracted_at: { type: "string", pattern: ISO_DATE_RE },
    services_list: { type: "string[]" },
    source_urls: { type: "string[]" },
    doctors: {
      type: "object[]",
      itemSchema: {
        name: { type: "string", required: true },
        credentials: { type: "string" },
        role: { type: "string" },
      },
    },
    brand_identity: {
      type: "object",
      schema: {
        tagline: { type: "string" },
        tone: { type: "string" },
        values: { type: "string[]" },
      },
    },
  },
};

const REVIEW_MINING: SectionSchema = {
  fields: {
    review_count: { type: "integer", min: 0 },
    total_reviews_on_google: { type: "integer", min: 0 },
    place_name: { type: "string" },
    avg_rating: { type: "number", min: 0, max: 5 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    mined_at: { type: "string", pattern: ISO_DATE_RE },
    voice_fingerprint_seeds: { type: "string[]" },
    top_themes: {
      type: "object[]",
      itemSchema: {
        theme: { type: "string", required: true },
        frequency: { type: "integer", min: 0 },
        example_quotes: { type: "string[]" },
      },
    },
    differentiator_signals: {
      type: "object[]",
      itemSchema: {
        signal: { type: "string", required: true },
        description: { type: "string" },
        evidence_count: { type: "integer", min: 0 },
      },
    },
    sentiment_summary: {
      type: "object",
      schema: {
        positive_pct: { type: "number", min: 0, max: 100 },
        neutral_pct: { type: "number", min: 0, max: 100 },
        negative_pct: { type: "number", min: 0, max: 100 },
        key_positives: { type: "string[]" },
        key_negatives: { type: "string[]" },
      },
    },
  },
};

const LOCALITY: SectionSchema = {
  fields: {
    neighbourhood: { type: "string" },
    formatted_address: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    fetched_at: { type: "string", pattern: ISO_DATE_RE },
    housing_character: { type: "string" },
    commuter_profile: { type: "string" },
    seasonal_notes: { type: "string" },
    local_trails_and_parks: { type: "string[]" },
    wildlife_profile: { type: "string[]" },
    cultural_communities: { type: "string[]" },
    community_anchors: { type: "string[]" },
    local_landmarks: { type: "string[]" },
  },
};

const SYNTHESIZED_PROFILE: SectionSchema = {
  fields: {
    completeness_score: { type: "number", min: 0, max: 100 },
    voice_fingerprint: { type: "string[]" },
    narrative_anchor: { type: "string" },
    clinic_differentiator: { type: "string" },
    governing_body: { type: "string" },
    jurisdiction: { type: "string" },
    hospital_type: { type: "string", enum: ["TYPE_1", "TYPE_2", "TYPE_3"] },
    hospital_type_reasoning: { type: "string" },
    stat_holiday_protocol: { type: "string" },
    founding_story: { type: "string" },
    doctors_voice_topic: { type: "string" },
    target_client_profile: { type: "string" },
    growth_priority: { type: "string" },
    owner_presence: { type: "string" },
    patient_consent: { type: "string", enum: ["YES", "NO", "CONDITIONAL", "NOT_CONFIRMED"] },
    synthesized_at: { type: "string", pattern: ISO_DATE_RE },
    content_exclusions: { type: "string[]" },
    google_review_themes: { type: "string[]" },
    differentiator_validated: { type: "boolean" },
    differentiator_validated_by: { type: "string" },
    differentiator_validated_at: { type: "string", pattern: ISO_DATE_RE },
    differentiator_validation_note: { type: "string" },
    differentiator_validation_source: { type: "string" },
    community_connections: {
      type: "object[]",
      itemSchema: {
        name: { type: "string", required: true },
        relationship: { type: "string" },
      },
    },
    confidence_flags: {
      type: "object[]",
      itemSchema: {
        field: { type: "string", required: true },
        issue: { type: "string" },
        resolution: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
    vedant_review_checklist: {
      type: "object[]",
      itemSchema: {
        item: { type: "string", required: true },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
      },
    },
    field_scores: {
      type: "object[]",
      itemSchema: {
        field: { type: "string", required: true },
        status: { type: "string", enum: ["captured", "partially_captured", "missing"] },
        weight: { type: "number", min: 0 },
        weighted_score: { type: "number", min: 0 },
        source: { type: "string" },
      },
    },
  },
};

export const BRAND_DNA_SCHEMAS = {
  website_extraction: WEBSITE_EXTRACTION,
  review_mining: REVIEW_MINING,
  locality: LOCALITY,
  synthesized_profile: SYNTHESIZED_PROFILE,
} as const;

export type BrandDNASchemaKey = keyof typeof BRAND_DNA_SCHEMAS;

/* ── Validation engine ─────────────────────────────────────────────────── */

function checkPrimitive(
  value: unknown,
  spec: Extract<FieldSpec, { type: Primitive }>,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (spec.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      issues.push({ level: "error", path, message: `must be an integer (got ${typeName(value)})` });
      return issues;
    }
  } else if (spec.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({ level: "error", path, message: `must be a finite number (got ${typeName(value)})` });
      return issues;
    }
  } else if (typeof value !== spec.type) {
    issues.push({ level: "error", path, message: `must be a ${spec.type} (got ${typeName(value)})` });
    return issues;
  }
  if (spec.enum && !spec.enum.includes(value as never)) {
    issues.push({ level: "error", path, message: `must be one of: ${spec.enum.join(", ")}` });
  }
  if ((spec.type === "number" || spec.type === "integer") && typeof value === "number") {
    if (spec.min !== undefined && value < spec.min) {
      issues.push({ level: "error", path, message: `must be ≥ ${spec.min}` });
    }
    if (spec.max !== undefined && value > spec.max) {
      issues.push({ level: "error", path, message: `must be ≤ ${spec.max}` });
    }
  }
  if (spec.type === "string" && spec.pattern && typeof value === "string" && value && !spec.pattern.test(value)) {
    issues.push({ level: "error", path, message: `does not match required format` });
  }
  return issues;
}

function checkField(value: unknown, spec: FieldSpec, path: string): ValidationIssue[] {
  if (spec.type === "string[]") {
    if (!Array.isArray(value)) {
      return [{ level: "error", path, message: `must be an array of strings (got ${typeName(value)})` }];
    }
    const issues: ValidationIssue[] = [];
    value.forEach((item, i) => {
      if (typeof item !== "string") {
        issues.push({ level: "error", path: `${path}[${i}]`, message: `must be a string (got ${typeName(item)})` });
      }
    });
    return issues;
  }
  if (spec.type === "object[]") {
    if (!Array.isArray(value)) {
      return [{ level: "error", path, message: `must be an array of objects (got ${typeName(value)})` }];
    }
    const issues: ValidationIssue[] = [];
    value.forEach((item, i) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        issues.push({ level: "error", path: `${path}[${i}]`, message: `must be an object` });
        return;
      }
      issues.push(...validateObject(item as Record<string, unknown>, spec.itemSchema, `${path}[${i}]`));
    });
    return issues;
  }
  if (spec.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [{ level: "error", path, message: `must be an object (got ${typeName(value)})` }];
    }
    return validateObject(value as Record<string, unknown>, spec.schema, path);
  }
  return checkPrimitive(value, spec, path);
}

function validateObject(
  obj: Record<string, unknown>,
  fields: Record<string, FieldSpec>,
  pathPrefix: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Required field presence
  for (const [name, spec] of Object.entries(fields)) {
    if ((spec as { required?: boolean }).required && (obj[name] === undefined || obj[name] === null)) {
      issues.push({
        level: "error",
        path: pathPrefix ? `${pathPrefix}.${name}` : name,
        message: `is required`,
      });
    }
  }
  // Per-field type checks
  for (const [name, value] of Object.entries(obj)) {
    const spec = fields[name];
    const path = pathPrefix ? `${pathPrefix}.${name}` : name;
    if (!spec) {
      issues.push({ level: "warning", path, message: `unknown field — will be saved as-is` });
      continue;
    }
    if (value === null || value === undefined) continue;
    issues.push(...checkField(value, spec, path));
  }
  return issues;
}

export function validateBrandDNASection(
  key: BrandDNASchemaKey,
  value: unknown,
): ValidationIssue[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ level: "error", path: "(root)", message: "must be a JSON object" }];
  }
  const schema = BRAND_DNA_SCHEMAS[key];
  return validateObject(value as Record<string, unknown>, schema.fields, "");
}

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
