import type { ComplianceScan, GeneratedPost, HospitalType, Jurisdiction } from './types';

// ════════════════════════════════════════════════════════════════
// VSA GBP COMPLIANCE SCANNER — v1.2.1
// Aligned with VSA Vet Media Inc. · GBP Post Prompt v1.2.1
// ════════════════════════════════════════════════════════════════

// ── Tier 1: VSA Core flagged terms (v1.2.1 expanded) ──
const FLAGGED_TERMS = [
  // Pharmaceutical language (v1.2.1)
  'prescription', 'pharmacy', 'medication', 'drug', 'dispensary', 'controlled substance',
  // Clinical overreach
  'treatment', 'therapy', 'diagnosis', 'cure', 'guaranteed',
  // Pet owner language
  'fur baby', 'furbaby', 'fur-baby',
  // Commercial / promotional triggers (v1.2.1)
  'best price', 'cheapest', 'lowest price', 'number one', '#1',
  'limited time offer', 'special offer', 'deal', 'discount',
  'half off', 'coupon',
  // False-positive trigger words
  'sex', 'sexual', 'mating', 'heat cycle', 'breeding',
];

// v1.2.1 flagged terms with replacements (for display)
export const FLAGGED_TERMS_REPLACEMENTS: Record<string, string> = {
  'prescription': 'veterinary care',
  'pharmacy': 'in-clinic services',
  'dispensary': 'in-clinic services',
  'medication': 'veterinary care / in-clinic care',
  'drug': 'veterinary care',
  'treatment': 'care / veterinary care / supportive care',
  'therapy': 'care / care plan',
  'diagnosis': 'assessment / evaluation',
  'cure': 'REMOVE ENTIRELY',
  'guaranteed': 'REMOVE ENTIRELY',
  'laser therapy': 'laser care',
  'fur baby': 'your pet / their pet',
  'furbaby': 'your pet / their pet',
  'fur-baby': 'your pet / their pet',
  'sex': 'intact pets / unaltered pets',
  'mating': 'pre-breeding consultation',
  'heat cycle': 'intact pet care',
  'breeding': 'pre-breeding consultation',
};

const SURGERY_REGEX = /\bsurgery\b/i;

const SPECIALIST_TERMS = [
  'specialist', 'board-certified specialist', 'veterinary specialist',
  'certified specialist',
];

// ── Tier 2: Named pharmaceutical brands (v1.2.1 expanded) ──
const DRUG_BRAND_NAMES = [
  'heartgard', 'interceptor', 'nexgard', 'bravecto', 'simparica',
  'frontline', 'advantage', 'advantix', 'revolution', 'seresto',
  'rimadyl', 'metacam', 'galliprant', 'apoquel', 'cytopoint',
  'cerenia', 'convenia', 'adequan', 'deramaxx', 'previcox',
  'sentinel', 'trifexis',
  'prednisone', 'dexamethasone', 'tramadol', 'gabapentin',
];

const PRESCRIPTION_TERMS = [
  'rx only', 'controlled substance', 'schedule ii',
  'schedule iii', 'schedule iv', 'narcotic',
];

const SENSITIVE_TERMS = [
  'euthanasia', 'put down', 'put to sleep', 'death', 'dying', 'terminal',
  'cancer treatment', 'chemotherapy', 'radiation therapy',
  'diagnose', 'prescribe',
];

// v1.2.1: Named medical devices / modalities (no CTA tied to these)
const MEDICAL_DEVICE_TERMS = [
  'microchipping', 'laser therapy', 'cryotherapy', 'endoscopy',
  'radiography', 'ultrasound', 'digital x-ray',
];

// v1.2.1: Outcome / longevity claim phrases
const OUTCOME_CLAIM_PATTERNS: RegExp[] = [
  /prevents?\s+cancer/i,
  /reduces?\s+(disease\s+)?risk(\s+by\s+\d+%?)?/i,
  /eliminates?\s+pain/i,
  /guaranteed\s+results/i,
  /pets?\s+live\s+longer/i,
  /extends?\s+lifespan/i,
  /your\s+pet\s+will\s+feel\s+better/i,
];

// v1.2.1 commercial / promotional regex triggers
const COMMERCIAL_PATTERNS: RegExp[] = [
  /\bbest\s+(price|deal|vet|clinic)\b/i,
  /\bsave\s+\$\d+/i,
  /\bonly\s+\$\d+/i,
  /\bhalf\s+off\b/i,
  /\bfree\b(?!\s+(consult|of\s+charge\s+for|to\s+chat))/i,
  /\b#1\b/,
];

const LANDING_PAGE_RISK_TERMS = [
  'buy now', 'order online', 'purchase', 'add to cart', 'shop now',
  'free trial', 'discount code', 'promo code',
  'before and after', 'transformation', 'guaranteed transformation',
];

// ── v1.2.1 Hospital Type Language Rules ──
// TYPE 1 = Emergency / 24-7
// TYPE 2 = Extended Hours (urgent care / walk-in / extended evenings)
// TYPE 3 = Daytime Clinic (urgent care / walk-in / same-day)
const HOSPITAL_TYPE_RULES: Record<number, { allowed: string[]; forbidden: string[] }> = {
  1: {
    allowed: ['emergency', 'after-hours', '24-hour', '24/7', 'emergency hospital', 'overnight emergency'],
    forbidden: [],
  },
  2: {
    allowed: ['urgent care', 'extended hours', 'open evenings', 'open 7 days', 'walk-in'],
    forbidden: ['emergency hospital', 'emergency clinic', '24-hour', '24/7', 'after-hours emergency'],
  },
  3: {
    allowed: ['urgent care', 'walk-in', 'same-day appointments', 'same-day'],
    forbidden: ['emergency hospital', 'emergency clinic', '24-hour', '24/7', 'after-hours emergency'],
  },
};

function countMatches(text: string, terms: string[]): { found: number; details: string[] } {
  const lower = text.toLowerCase();
  const details: string[] = [];
  for (const term of terms) {
    if (lower.includes(term.toLowerCase())) {
      details.push(term);
    }
  }
  return { found: details.length, details };
}

function hasEmDash(text: string): boolean {
  return text.includes('—');
}

function hasUsEnglishIssue(text: string): boolean {
  const britishSpellings = ['colour', 'favour', 'behaviour', 'specialise', 'organise', 'centre', 'metre', 'defence', 'licence', 'analyse'];
  const lower = text.toLowerCase();
  return britishSpellings.some(s => lower.includes(s));
}

// v1.2.1: Allow 1-2 emojis at start/end only. Forbid regulated-item emojis anywhere.
const FORBIDDEN_EMOJIS = ['💊', '💉', '🔪', '🍷', '🚬'];
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function hasEmojiViolation(text: string): boolean {
  // Forbidden regulated-item emojis = always violation
  if (FORBIDDEN_EMOJIS.some(e => text.includes(e))) return true;

  const matches = text.match(EMOJI_REGEX) || [];
  if (matches.length === 0) return false;
  // Max 2 per post
  if (matches.length > 2) return true;

  // Mid-sentence check: emoji must only appear in first 12 chars or last 12 chars (start/end)
  const len = text.length;
  for (const match of matches) {
    const idx = text.indexOf(match);
    const atStart = idx <= 12;
    const atEnd = idx >= len - 12;
    if (!atStart && !atEnd) return true;
  }
  return false;
}

// v1.2.1: Trigger 1 — no URL or domain in body
function hasUrlInBody(text: string): boolean {
  return /https?:\/\//i.test(text) || /www\./i.test(text) || /\b[a-z0-9-]+\.(com|ca|net|org|vet|clinic|co|io)\b/i.test(text);
}

// v1.2.1: No street address in body (basic detector — number + street suffix)
function hasAddressInBody(text: string): boolean {
  return /\b\d{1,5}\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Place|Pl\.?)\b/i.test(text);
}

// v1.2.1: No phone numbers in body
function hasPhoneInBody(text: string): boolean {
  // Matches (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx, +1 xxx xxx xxxx
  return /(\+?\d[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/.test(text);
}

// v1.2.1: ALL CAPS check
function hasAllCaps(text: string): boolean {
  return /\b[A-Z]{3,}\b/.test(text.replace(/\b(CTA|URL|GBP|VSA|AAHA|AVMA|CVMA|WSAVA|BC|AB|ON|CA|US|UK)\b/g, ''));
}

// v1.2.1: Punctuation — max 1 exclamation; no !!!, ???, $$$
function hasExcessivePunctuation(text: string): boolean {
  if (/!!|\?\?|\$\$/.test(text)) return true;
  const exclaims = (text.match(/!/g) || []).length;
  return exclaims > 1;
}

// v1.2.1: Button-referenced closing required. e.g. "Tap Book to ...", "Tap Call to ...", "Tap Learn more to ..."
function hasButtonReferencedClosing(text: string): boolean {
  // Look at last sentence
  const trimmed = text.trim();
  const tail = trimmed.slice(-200);
  return /\bTap\s+(Book|Call|Learn\s+more|Sign\s+up)\b/i.test(tail);
}

export function runComplianceScan(
  posts: GeneratedPost[],
  clinicName: string,
  monthYear: string,
  hospitalType: HospitalType,
  jurisdiction: Jurisdiction,
  neighbourhood: string,
  _phoneNumber: string
): ComplianceScan {
  const allContent = posts.map(p => p.post_content).join(' ');
  let issuesCount = 0;

  // ── TIER 1: VSA Core ──
  const flaggedTerms = countMatches(allContent, FLAGGED_TERMS);
  if (SURGERY_REGEX.test(allContent)) {
    flaggedTerms.found += 1;
    flaggedTerms.details.push('surgery');
  }
  if (flaggedTerms.found > 0) issuesCount += flaggedTerms.found;

  const emDashes = posts.reduce<string[]>((acc, p, i) => {
    if (hasEmDash(p.post_content)) acc.push(`Post ${i + 1}`);
    return acc;
  }, []);
  if (emDashes.length > 0) issuesCount += emDashes.length;

  // Spelling: BC/Canadian use UK-ish spellings (behaviour OK). For US: flag British.
  const isCanadian = jurisdiction === 'BC' || jurisdiction === 'CA-OTHER';
  const usEnglish = !isCanadian && hasUsEnglishIssue(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (usEnglish === 'FAIL') issuesCount++;

  const specialistClaims = countMatches(allContent, SPECIALIST_TERMS).found > 0 ? 'FAIL' as const : 'PASS' as const;
  if (specialistClaims === 'FAIL') issuesCount++;

  const typeRules = HOSPITAL_TYPE_RULES[hospitalType] || HOSPITAL_TYPE_RULES[3];
  const forbiddenUsed = typeRules.forbidden.filter(t => allContent.toLowerCase().includes(t.toLowerCase()));
  const hospitalTypeLanguage = forbiddenUsed.length > 0 ? 'FAIL' as const : 'PASS' as const;
  if (hospitalTypeLanguage === 'FAIL') issuesCount += forbiddenUsed.length;

  const guaranteedOutcomes = /guarante/i.test(allContent) || OUTCOME_CLAIM_PATTERNS.some(re => re.test(allContent))
    ? 'FAIL' as const : 'PASS' as const;
  if (guaranteedOutcomes === 'FAIL') issuesCount++;

  // v1.2.1: Emoji rule (1-2 max, start/end only, no regulated-item emojis)
  const emojiCompliance = posts.some(p => hasEmojiViolation(p.post_content)) ? 'FAIL' as const : 'PASS' as const;
  if (emojiCompliance === 'FAIL') issuesCount++;

  // v1.2.1: Excessive punctuation (rolled into flagged_terms count via separate increment)
  if (posts.some(p => hasExcessivePunctuation(p.post_content))) issuesCount++;

  // v1.2.1: ALL CAPS
  if (posts.some(p => hasAllCaps(p.post_content))) issuesCount++;

  // ── TIER 2: Regulated content ──
  const prescriptionDrugTerms = countMatches(allContent, PRESCRIPTION_TERMS);
  if (prescriptionDrugTerms.found > 0) issuesCount += prescriptionDrugTerms.found;

  const drugBrandNames = countMatches(allContent, DRUG_BRAND_NAMES);
  if (drugBrandNames.found > 0) issuesCount += drugBrandNames.found;

  // v1.2.1: medical device promotion check — only fail if device named AND CTA tied to it
  const deviceMentions = countMatches(allContent, MEDICAL_DEVICE_TERMS);
  let deviceCtaViolation = false;
  for (const post of posts) {
    const lowerBody = post.post_content.toLowerCase();
    const lowerCta = (post.cta_text || '').toLowerCase();
    for (const device of MEDICAL_DEVICE_TERMS) {
      if (lowerBody.includes(device) && (lowerCta.includes(device.split(' ')[0]) || lowerBody.includes(`book your ${device}`) || lowerBody.includes(`schedule your ${device}`))) {
        deviceCtaViolation = true;
        break;
      }
    }
  }
  if (deviceCtaViolation) issuesCount++;

  const directHealthTargeting = /your\s+(illness|disease|condition|diagnosis|symptoms)/i.test(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (directHealthTargeting === 'FAIL') issuesCount++;

  const outcomeGuarantee = /100%|guaranteed\s+(cure|results|recovery)|(?:^|\s)(cure|heal|fix)(?:\s|$)/im.test(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (outcomeGuarantee === 'FAIL') issuesCount++;

  const sensitiveTerms = countMatches(allContent, SENSITIVE_TERMS);
  if (sensitiveTerms.found > 0) issuesCount += sensitiveTerms.found;

  const landingPageRiskDetails: string[] = [];
  for (const term of LANDING_PAGE_RISK_TERMS) {
    if (allContent.toLowerCase().includes(term.toLowerCase())) landingPageRiskDetails.push(term);
  }
  for (const re of COMMERCIAL_PATTERNS) {
    const m = allContent.match(re);
    if (m) landingPageRiskDetails.push(m[0]);
  }
  if (landingPageRiskDetails.length > 0) issuesCount += landingPageRiskDetails.length;

  // ── TIER 3: Performance + v1.2.1 anti-abuse (phone/URL/address in body) ──
  const geoKeywordFirst100: Record<string, boolean> = {};
  const hookStrength: Record<string, boolean> = {};
  const wordCount: Record<string, number> = {};
  const allKeywords = new Set<string>();
  let ctaHasServicePage = true;
  let neighbourhoodInAll = true;
  let phoneInBodyAny = false;
  let addressInBodyAny = false;
  let buttonClosingMissing = false;

  const lower_neighbourhood = neighbourhood?.toLowerCase() || '';

  for (let i = 0; i < 4; i++) {
    const post = posts[i];
    const key = `post_${i + 1}`;
    if (!post) {
      geoKeywordFirst100[key] = false;
      hookStrength[key] = false;
      wordCount[key] = 0;
      continue;
    }

    const first100 = post.post_content.substring(0, 100).toLowerCase();
    geoKeywordFirst100[key] = lower_neighbourhood ? first100.includes(lower_neighbourhood) : true;
    if (!geoKeywordFirst100[key]) issuesCount++;

    const firstSentence = post.post_content.split(/[.!?]/)[0] || '';
    hookStrength[key] = firstSentence.includes('?') || /\d+%|\d+ out of/i.test(firstSentence) || firstSentence.length > 15;
    if (!hookStrength[key]) issuesCount++;

    const wc = post.post_content.split(/\s+/).filter(Boolean).length;
    wordCount[key] = wc;
    if (wc < 80 || wc > 120) issuesCount++;

    // v1.2.1: Phone NEVER in body
    if (hasPhoneInBody(post.post_content)) phoneInBodyAny = true;
    // v1.2.1: Address NEVER in body
    if (hasAddressInBody(post.post_content)) addressInBodyAny = true;
    // v1.2.1: Button-referenced closing required
    if (!hasButtonReferencedClosing(post.post_content)) buttonClosingMissing = true;

    allKeywords.add(post.primary_keyword.toLowerCase());
    post.secondary_keywords?.forEach(k => allKeywords.add(k.toLowerCase()));

    if (!post.cta_url || post.cta_url.length < 5) ctaHasServicePage = false;

    if (lower_neighbourhood && !post.post_content.toLowerCase().includes(lower_neighbourhood)) {
      neighbourhoodInAll = false;
    }
  }

  // v1.2.1: URL in body check (cross-post)
  const urlInBodyAny = posts.some(p => hasUrlInBody(p.post_content));
  if (urlInBodyAny) issuesCount++;

  const phoneNotInBody = phoneInBodyAny ? 'FAIL' as const : 'PASS' as const;
  if (phoneNotInBody === 'FAIL') issuesCount++;

  const addressNotInBody = addressInBodyAny ? 'FAIL' as const : 'PASS' as const;
  if (addressNotInBody === 'FAIL') issuesCount++;

  const buttonReferencedClosing = buttonClosingMissing ? 'FAIL' as const : 'PASS' as const;
  if (buttonReferencedClosing === 'FAIL') issuesCount++;

  const keywordDiversity = allKeywords.size >= 4 ? 'PASS' as const : 'FAIL' as const;
  if (keywordDiversity === 'FAIL') issuesCount++;

  if (!ctaHasServicePage) issuesCount++;
  if (!neighbourhoodInAll) issuesCount++;

  const serviceKeyword = posts.some(p => p.primary_keyword && p.post_content.toLowerCase().includes(p.primary_keyword.toLowerCase()))
    ? 'PASS' as const : 'FAIL' as const;
  if (serviceKeyword === 'FAIL') issuesCount++;

  const overall = issuesCount === 0 ? 'PASS' as const : 'FAIL' as const;

  return {
    clinic_name: clinicName,
    month_year: monthYear,
    tier_1: {
      flagged_terms: flaggedTerms,
      em_dashes: { found: emDashes.length, details: emDashes },
      us_english: usEnglish,
      specialist_claims: specialistClaims,
      hospital_type_language: { result: hospitalTypeLanguage, type: hospitalType },
      guaranteed_outcomes: guaranteedOutcomes,
      emoji_compliance: emojiCompliance,
    },
    tier_2: {
      prescription_drug_terms: prescriptionDrugTerms,
      drug_brand_names: drugBrandNames,
      direct_health_targeting: directHealthTargeting,
      outcome_guarantee: outcomeGuarantee,
      sensitive_terms: sensitiveTerms,
      landing_page_risk_terms: { found: landingPageRiskDetails.length, details: landingPageRiskDetails },
    },
    tier_3: {
      geo_keyword_first_100: geoKeywordFirst100 as any,
      service_keyword: serviceKeyword,
      hook_strength: hookStrength as any,
      word_count: wordCount as any,
      phone_not_in_body: phoneNotInBody,
      address_not_in_body: addressNotInBody,
      button_referenced_closing: buttonReferencedClosing,
      keyword_diversity: keywordDiversity,
      cta_service_page: ctaHasServicePage ? 'PASS' : 'FAIL',
      neighbourhood_in_all: neighbourhoodInAll ? 'PASS' : 'FAIL',
    },
    overall,
    issues_count: issuesCount,
  };
}

// ── Topic Title Compliance Scanner ──
export interface TopicTitleScanResult {
  pass: boolean;
  issues: string[];
}

export function scanTopicTitle(title: string): TopicTitleScanResult {
  const issues: string[] = [];
  const lower = title.toLowerCase();

  for (const term of FLAGGED_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      issues.push(`Flagged term: "${term}"`);
    }
  }

  for (const term of SPECIALIST_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      issues.push(`Specialist claim: "${term}"`);
    }
  }

  if (SURGERY_REGEX.test(title)) {
    issues.push('Contains "surgery" - context-dependent, review needed');
  }

  for (const drug of DRUG_BRAND_NAMES) {
    if (lower.includes(drug.toLowerCase())) {
      issues.push(`Drug brand name: "${drug}"`);
    }
  }

  for (const term of PRESCRIPTION_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      issues.push(`Prescription term: "${term}"`);
    }
  }

  for (const term of SENSITIVE_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      issues.push(`Sensitive term: "${term}"`);
    }
  }

  if (hasEmDash(title)) {
    issues.push('Contains em-dash (—) - use hyphens instead');
  }

  if (hasUsEnglishIssue(title)) {
    issues.push('Contains British spelling - use US English');
  }

  return { pass: issues.length === 0, issues };
}
