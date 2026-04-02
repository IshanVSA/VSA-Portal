// GBP Posts Feature — TypeScript Types

export type HookStyle = 'STAT' | 'QUESTION' | 'URGENCY' | 'MYTH-BUST';
export type TopicVariant = 'A' | 'B' | 'C' | 'D';
export type ClusterPosition = 'A' | 'B' | 'C' | 'D';
export type PostType = 'WHATS_NEW' | 'PRODUCTS_SERVICES';
export type PostStatus = 'generated' | 'reviewed' | 'approved' | 'published' | 'rejected';
export type BatchStatus = 'queued' | 'in_progress' | 'qa' | 'complete';
export type HospitalType = 1 | 2 | 3;
export type Jurisdiction = 'BC' | 'CA-OTHER' | 'US';
export type ContentType = 'blog' | 'p2_page' | 'gbp_post';

export interface GeoCluster {
  id: string;
  cluster_id: string;
  region: string;
  clinics: string[];
  is_solo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicGBPConfig {
  id: string;
  clinic_id: string;
  cluster_id: string | null;
  cluster_position: ClusterPosition | null;
  hospital_type: HospitalType | null;
  local_landmarks: string[];
  topic_variant_current: TopicVariant | null;
  hook_style_current: HookStyle | null;
  last_variant_used: string | null;
  geo_radius_km: number;
  jurisdiction: Jurisdiction | null;
  phone_number: string | null;
  neighbourhood: string | null;
  top_services: string[];
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GBPPostHistory {
  id: string;
  clinic_id: string;
  month: number;
  year: number;
  week_number: 1 | 2 | 3 | 4;
  post_type: PostType;
  topic: string;
  hook_style: HookStyle | null;
  primary_keyword: string;
  secondary_keywords: string[];
  post_content: string;
  cta_text: string | null;
  cta_url: string | null;
  word_count: number | null;
  topic_variant: TopicVariant | null;
  local_landmark_used: string | null;
  status: PostStatus;
  compliance_scan: ComplianceScan | null;
  batch_id: string | null;
  generated_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GBPBatch {
  id: string;
  month: number;
  year: number;
  batch_number: number;
  cluster_id: string | null;
  clinics: string[];
  status: BatchStatus;
  collision_check: CollisionCheckResult | null;
  created_at: string;
  updated_at: string;
}

export interface GBPTopicSet {
  id: string;
  month: number;
  variant: TopicVariant;
  week_1_topic: string;
  week_2_topic: string;
  week_3_topic: string;
  week_4_topic: string;
  seasonal_theme: string;
  created_at: string;
  updated_at: string;
}

export interface GBPComplianceScanRecord {
  id: string;
  clinic_id: string;
  batch_id: string | null;
  month: number;
  year: number;
  scan_result: ComplianceScan;
  overall_pass: boolean;
  issues_count: number;
  scanned_at: string;
}

export interface GBPRecentContent {
  id: string;
  clinic_id: string;
  content_type: ContentType;
  title: string;
  primary_keyword: string | null;
  topic_cluster: string | null;
  publish_date: string | null;
  source_month: number | null;
  source_year: number | null;
  created_at: string;
}

// Compliance Scan Types
export interface ComplianceScan {
  clinic_name: string;
  month_year: string;
  tier_1: {
    flagged_terms: { found: number; details: string[] };
    em_dashes: { found: number; details: string[] };
    us_english: 'PASS' | 'FAIL';
    specialist_claims: 'PASS' | 'FAIL';
    hospital_type_language: { result: 'PASS' | 'FAIL'; type: number };
    guaranteed_outcomes: 'PASS' | 'FAIL';
    emoji_compliance: 'PASS' | 'FAIL';
  };
  tier_2: {
    prescription_drug_terms: { found: number; details: string[] };
    drug_brand_names: { found: number; details: string[] };
    direct_health_targeting: 'PASS' | 'FAIL';
    outcome_guarantee: 'PASS' | 'FAIL';
    sensitive_terms: { found: number; details: string[] };
    landing_page_risk_terms: { found: number; details: string[] };
  };
  tier_3: {
    geo_keyword_first_100: { post_1: boolean; post_2: boolean; post_3: boolean; post_4: boolean };
    service_keyword: 'PASS' | 'FAIL';
    hook_strength: { post_1: boolean; post_2: boolean; post_3: boolean; post_4: boolean };
    word_count: { post_1: number; post_2: number; post_3: number; post_4: number };
    phone_in_2_plus: 'PASS' | 'FAIL';
    keyword_diversity: 'PASS' | 'FAIL';
    cta_service_page: 'PASS' | 'FAIL';
    neighbourhood_in_all: 'PASS' | 'FAIL';
  };
  overall: 'PASS' | 'FAIL';
  issues_count: number;
}

export interface CollisionCheckResult {
  topic_overlap: { pass: boolean; details: string[] };
  hook_style_match: { pass: boolean; details: string[] };
  shared_keywords: { pass: boolean; details: string[] };
  landmark_collision: { pass: boolean; details: string[] };
  overall: boolean;
}

// Generation request/response
export interface GenerateGBPPostsRequest {
  clinic_id: string;
  month: number;
  year: number;
  hospital_type: HospitalType;
  topic_variant: TopicVariant;
  hook_style: HookStyle;
  local_landmarks: string[];
  neighbourhood: string;
  phone_number: string;
  website_url: string;
  top_services: string[];
  jurisdiction: Jurisdiction;
  topics: {
    week_1: string;
    week_2: string;
    week_3: string;
    week_4: string;
  };
  recent_content_context: {
    last_month_gbp: Array<{ topic: string; hook: string; keywords: string[] }>;
    recent_blogs: Array<{ title: string; primary_keyword: string }>;
    recent_p2_pages: Array<{ service_name: string }>;
  };
}

export interface GeneratedPost {
  week_number: 1 | 2 | 3 | 4;
  post_type: PostType;
  topic: string;
  hook_style: HookStyle;
  primary_keyword: string;
  secondary_keywords: string[];
  post_content: string;
  cta_text: string;
  cta_url: string;
  word_count: number;
  local_landmark_used: string;
}

export interface GenerateGBPPostsResponse {
  posts: GeneratedPost[];
  compliance_scan: ComplianceScan;
}
