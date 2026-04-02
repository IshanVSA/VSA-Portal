import type { ComplianceScan, GeneratedPost, HospitalType, Jurisdiction } from './types';

// ── Tier 1: VSA Core flagged terms ──
const FLAGGED_TERMS = [
  'best', 'top', 'leading', 'premier', 'superior', '#1', 'number one',
  'guaranteed', 'cure', 'miracle', 'revolutionary', 'breakthrough',
  'risk-free', 'no side effects', 'proven cure', 'instant results',
  'world-class', 'unmatched', 'exclusive', 'only clinic',
];

const SPECIALIST_TERMS = [
  'specialist', 'board-certified specialist', 'veterinary specialist',
  'certified specialist',
];

// ── Tier 2: Google Ads Healthcare ──
const DRUG_BRAND_NAMES = [
  'rimadyl', 'metacam', 'apoquel', 'cerenia', 'convenia', 'adequan',
  'deramaxx', 'previcox', 'galliprant', 'simparica', 'bravecto',
  'nexgard', 'heartgard', 'sentinel', 'trifexis', 'revolution',
  'prednisone', 'dexamethasone', 'tramadol', 'gabapentin',
];

const PRESCRIPTION_TERMS = [
  'prescription', 'rx only', 'controlled substance', 'schedule ii',
  'schedule iii', 'schedule iv', 'narcotic',
];

const SENSITIVE_TERMS = [
  'euthanasia', 'put down', 'put to sleep', 'death', 'dying', 'terminal',
  'cancer treatment', 'chemotherapy', 'radiation therapy',
];

const LANDING_PAGE_RISK_TERMS = [
  'buy now', 'order online', 'purchase', 'add to cart', 'shop now',
  'free trial', 'discount code', 'promo code',
];

// ── Hospital Type Language Rules ──
const HOSPITAL_TYPE_RULES: Record<number, { allowed: string[]; forbidden: string[] }> = {
  1: { allowed: ['veterinary clinic', 'animal clinic', 'pet clinic', 'vet clinic'], forbidden: ['animal hospital', 'emergency hospital', '24/7 emergency'] },
  2: { allowed: ['veterinary clinic', 'animal hospital', 'pet hospital'], forbidden: ['24/7 emergency', 'emergency room', 'ER'] },
  3: { allowed: ['animal hospital', 'veterinary hospital', 'emergency hospital', '24/7 emergency'], forbidden: [] },
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

function hasEmoji(text: string): boolean {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const matches = text.match(emojiRegex);
  return (matches?.length ?? 0) > 2;
}

export function runComplianceScan(
  posts: GeneratedPost[],
  clinicName: string,
  monthYear: string,
  hospitalType: HospitalType,
  jurisdiction: Jurisdiction,
  neighbourhood: string,
  phoneNumber: string
): ComplianceScan {
  const allContent = posts.map(p => p.post_content).join(' ');
  let issuesCount = 0;

  // ── TIER 1: VSA Core ──
  const flaggedTerms = countMatches(allContent, FLAGGED_TERMS);
  if (flaggedTerms.found > 0) issuesCount += flaggedTerms.found;

  const emDashes = posts.reduce<string[]>((acc, p, i) => {
    if (hasEmDash(p.post_content)) acc.push(`Post ${i + 1}`);
    return acc;
  }, []);
  if (emDashes.length > 0) issuesCount += emDashes.length;

  const usEnglish = hasUsEnglishIssue(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (usEnglish === 'FAIL') issuesCount++;

  const specialistClaims = countMatches(allContent, SPECIALIST_TERMS).found > 0 ? 'FAIL' as const : 'PASS' as const;
  if (specialistClaims === 'FAIL') issuesCount++;

  // Hospital type language check
  const typeRules = HOSPITAL_TYPE_RULES[hospitalType] || HOSPITAL_TYPE_RULES[1];
  const forbiddenUsed = typeRules.forbidden.filter(t => allContent.toLowerCase().includes(t.toLowerCase()));
  const hospitalTypeLanguage = forbiddenUsed.length > 0 ? 'FAIL' as const : 'PASS' as const;
  if (hospitalTypeLanguage === 'FAIL') issuesCount += forbiddenUsed.length;

  const guaranteedOutcomes = /guarante/i.test(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (guaranteedOutcomes === 'FAIL') issuesCount++;

  const emojiCompliance = posts.some(p => hasEmoji(p.post_content)) ? 'FAIL' as const : 'PASS' as const;
  if (emojiCompliance === 'FAIL') issuesCount++;

  // ── TIER 2: Google Ads Healthcare ──
  const prescriptionDrugTerms = countMatches(allContent, PRESCRIPTION_TERMS);
  if (prescriptionDrugTerms.found > 0) issuesCount += prescriptionDrugTerms.found;

  const drugBrandNames = countMatches(allContent, DRUG_BRAND_NAMES);
  if (drugBrandNames.found > 0) issuesCount += drugBrandNames.found;

  const directHealthTargeting = /your\s+(illness|disease|condition|diagnosis)/i.test(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (directHealthTargeting === 'FAIL') issuesCount++;

  const outcomeGuarantee = /100%|guaranteed\s+(cure|results|recovery)/i.test(allContent) ? 'FAIL' as const : 'PASS' as const;
  if (outcomeGuarantee === 'FAIL') issuesCount++;

  const sensitiveTerms = countMatches(allContent, SENSITIVE_TERMS);
  if (sensitiveTerms.found > 0) issuesCount += sensitiveTerms.found;

  const landingPageRiskTerms = countMatches(allContent, LANDING_PAGE_RISK_TERMS);
  if (landingPageRiskTerms.found > 0) issuesCount += landingPageRiskTerms.found;

  // ── TIER 3: Performance ──
  const geoKeywordFirst100: Record<string, boolean> = {};
  const hookStrength: Record<string, boolean> = {};
  const wordCount: Record<string, number> = {};
  let phoneCount = 0;
  const allKeywords = new Set<string>();
  let ctaHasServicePage = true;
  let neighbourhoodInAll = true;

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

    // Hook strength: first sentence should be compelling (has ? or stat or action verb)
    const firstSentence = post.post_content.split(/[.!?]/)[0] || '';
    hookStrength[key] = firstSentence.includes('?') || /\d+%|\d+ out of/i.test(firstSentence) || firstSentence.length > 15;
    if (!hookStrength[key]) issuesCount++;

    const wc = post.post_content.split(/\s+/).length;
    wordCount[key] = wc;
    if (wc < 80 || wc > 120) issuesCount++;

    if (post.post_content.includes(phoneNumber)) phoneCount++;

    allKeywords.add(post.primary_keyword.toLowerCase());
    post.secondary_keywords?.forEach(k => allKeywords.add(k.toLowerCase()));

    if (!post.cta_url || post.cta_url.length < 5) ctaHasServicePage = false;

    if (lower_neighbourhood && !post.post_content.toLowerCase().includes(lower_neighbourhood)) {
      neighbourhoodInAll = false;
    }
  }

  const phoneIn2Plus = phoneCount >= 2 ? 'PASS' as const : 'FAIL' as const;
  if (phoneIn2Plus === 'FAIL') issuesCount++;

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
      landing_page_risk_terms: landingPageRiskTerms,
    },
    tier_3: {
      geo_keyword_first_100: geoKeywordFirst100 as any,
      service_keyword: serviceKeyword,
      hook_strength: hookStrength as any,
      word_count: wordCount as any,
      phone_in_2_plus: phoneIn2Plus,
      keyword_diversity: keywordDiversity,
      cta_service_page: ctaHasServicePage ? 'PASS' : 'FAIL',
      neighbourhood_in_all: neighbourhoodInAll ? 'PASS' : 'FAIL',
    },
    overall,
    issues_count: issuesCount,
  };
}
