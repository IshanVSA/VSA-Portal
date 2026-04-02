import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ShieldCheck, ShieldAlert, AlertTriangle, Wrench } from "lucide-react";
import type { ComplianceScan } from "@/lib/gbp/types";

function PassFail({ value }: { value: 'PASS' | 'FAIL' | string }) {
  return value === 'PASS'
    ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">PASS</Badge>
    : <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">FAIL</Badge>;
}

function CountBadge({ label, count, details }: { label: string; count: number; details: string[] }) {
  const isFail = count > 0;
  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded-md ${isFail ? 'bg-destructive/5 border border-destructive/20' : ''}`}>
      <span className={`text-xs ${isFail ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{label}</span>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <span className="text-[10px] text-destructive font-medium">{details.join(', ')}</span>
        )}
        {count === 0
          ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">0</Badge>
          : <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">{count}</Badge>
        }
      </div>
    </div>
  );
}

function CheckRow({ label, value }: { label: string; value: 'PASS' | 'FAIL' | string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <PassFail value={value} />
    </div>
  );
}

/** Extract human-readable issue descriptions from a compliance scan */
export function extractIssueDescriptions(scan: ComplianceScan): string[] {
  const issues: string[] = [];

  // Tier 1
  if (scan.tier_1.flagged_terms.found > 0)
    issues.push(`Tier 1 — Flagged terms found: ${scan.tier_1.flagged_terms.details.join(', ')}. Replace with compliant alternatives.`);
  if (scan.tier_1.em_dashes.found > 0)
    issues.push(`Tier 1 — Em dashes (—) found in ${scan.tier_1.em_dashes.details.join(', ')}. Replace with hyphens (-).`);
  if (scan.tier_1.us_english === 'FAIL')
    issues.push('Tier 1 — British spelling detected. Convert all spelling to US English (e.g., "behaviour" → "behavior", "centre" → "center").');
  if (scan.tier_1.specialist_claims === 'FAIL')
    issues.push('Tier 1 — Specialist claims detected. Remove any "specialist", "board-certified specialist" language.');
  if (scan.tier_1.hospital_type_language.result === 'FAIL')
    issues.push(`Tier 1 — Hospital Type ${scan.tier_1.hospital_type_language.type} language violation. Remove forbidden emergency/24-hour terms for this hospital type.`);
  if (scan.tier_1.guaranteed_outcomes === 'FAIL')
    issues.push('Tier 1 — Guaranteed outcome language detected. Remove "guarantee" and similar outcome-promising words.');
  if (scan.tier_1.emoji_compliance === 'FAIL')
    issues.push('Tier 1 — Emoji violation: emojis must only appear at the very start or end of a post, max 2 per post.');

  // Tier 2
  if (scan.tier_2.prescription_drug_terms.found > 0)
    issues.push(`Tier 2 — Prescription drug terms found: ${scan.tier_2.prescription_drug_terms.details.join(', ')}. Replace with "comfort care", "supportive care", "wellness support".`);
  if (scan.tier_2.drug_brand_names.found > 0)
    issues.push(`Tier 2 — Drug brand names found: ${scan.tier_2.drug_brand_names.details.join(', ')}. Replace with generic terms like "preventive care products", "parasite prevention".`);
  if (scan.tier_2.direct_health_targeting === 'FAIL')
    issues.push('Tier 2 — Direct health targeting language detected ("your condition/symptoms"). Use "signs you may notice in your pet" instead.');
  if (scan.tier_2.outcome_guarantee === 'FAIL')
    issues.push('Tier 2 — Outcome guarantee words (cure/heal/fix/100%) detected. Use "manage", "support", "help with" instead.');
  if (scan.tier_2.sensitive_terms.found > 0)
    issues.push(`Tier 2 — Sensitive terms found: ${scan.tier_2.sensitive_terms.details.join(', ')}. Use compliant alternatives (e.g., "end-of-life support", "assess", "evaluate").`);
  if (scan.tier_2.landing_page_risk_terms.found > 0)
    issues.push(`Tier 2 — Landing page risk terms found: ${scan.tier_2.landing_page_risk_terms.details.join(', ')}. Remove commercial/transactional language.`);

  // Tier 3
  for (let i = 1; i <= 4; i++) {
    const key = `post_${i}` as keyof typeof scan.tier_3.geo_keyword_first_100;
    if (!scan.tier_3.geo_keyword_first_100[key])
      issues.push(`Tier 3 — Post ${i}: neighbourhood/geo keyword missing from first 100 characters. Add it near the beginning of the post.`);
  }
  if (scan.tier_3.service_keyword === 'FAIL')
    issues.push('Tier 3 — Service keyword not found in post content. Ensure at least one post contains its primary keyword in the body text.');
  for (let i = 1; i <= 4; i++) {
    const key = `post_${i}` as keyof typeof scan.tier_3.word_count;
    const wc = scan.tier_3.word_count[key];
    if (wc < 80) issues.push(`Tier 3 — Post ${i}: word count is ${wc} (minimum 80). Add more content.`);
    if (wc > 120) issues.push(`Tier 3 — Post ${i}: word count is ${wc} (maximum 120). Trim the post.`);
  }
  if (scan.tier_3.phone_in_2_plus === 'FAIL')
    issues.push('Tier 3 — Phone number must appear in at least 2 of the 4 posts. Add the clinic phone number to more posts.');
  if (scan.tier_3.keyword_diversity === 'FAIL')
    issues.push('Tier 3 — Keyword diversity failed. Each post must have a unique primary keyword — no overlap allowed.');
  if (scan.tier_3.cta_service_page === 'FAIL')
    issues.push('Tier 3 — CTA links to homepage or is missing. Each post CTA must link to a specific service page.');
  if (scan.tier_3.neighbourhood_in_all === 'FAIL')
    issues.push('Tier 3 — Neighbourhood name missing from one or more posts. Every post must mention the neighbourhood.');

  return issues;
}

interface Props {
  scan: ComplianceScan;
  onFixIssues?: (issues: string[]) => void;
  isFixing?: boolean;
}

export function ComplianceScanDisplay({ scan, onFixIssues, isFixing }: Props) {
  const [openTiers, setOpenTiers] = useState<Record<string, boolean>>({ tier1: true, tier2: false, tier3: false });

  const toggle = (tier: string) => setOpenTiers(prev => ({ ...prev, [tier]: !prev[tier] }));

  const tierIcon = scan.overall === 'PASS' ? ShieldCheck : ShieldAlert;
  const TierIcon = tierIcon;

  const handleFix = () => {
    if (!onFixIssues) return;
    const issues = extractIssueDescriptions(scan);
    onFixIssues(issues);
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TierIcon className={`h-4 w-4 ${scan.overall === 'PASS' ? 'text-emerald-500' : 'text-destructive'}`} />
            Compliance Scan
          </CardTitle>
          <div className="flex items-center gap-2">
            {scan.issues_count > 0 && onFixIssues && (
              <Button
                onClick={handleFix}
                disabled={isFixing}
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
              >
                <Wrench className="h-3 w-3" />
                {isFixing ? 'Fixing...' : 'Fix Issues'}
              </Button>
            )}
            {scan.issues_count > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {scan.issues_count} issue{scan.issues_count !== 1 ? 's' : ''}
              </Badge>
            )}
            <PassFail value={scan.overall} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {/* Tier 1: VSA Core */}
        <Collapsible open={openTiers.tier1} onOpenChange={() => toggle('tier1')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <span className="text-xs font-medium">Tier 1 — VSA Core</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${openTiers.tier1 ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 space-y-0.5">
            <CountBadge label="Flagged Terms" count={scan.tier_1.flagged_terms.found} details={scan.tier_1.flagged_terms.details} />
            <CountBadge label="Em Dashes" count={scan.tier_1.em_dashes.found} details={scan.tier_1.em_dashes.details} />
            <CheckRow label="US English" value={scan.tier_1.us_english} />
            <CheckRow label="Specialist Claims" value={scan.tier_1.specialist_claims} />
            <CheckRow label={`Hospital Type ${scan.tier_1.hospital_type_language.type} Language`} value={scan.tier_1.hospital_type_language.result} />
            <CheckRow label="Guaranteed Outcomes" value={scan.tier_1.guaranteed_outcomes} />
            <CheckRow label="Emoji Compliance" value={scan.tier_1.emoji_compliance} />
          </CollapsibleContent>
        </Collapsible>

        {/* Tier 2: Google Ads Healthcare */}
        <Collapsible open={openTiers.tier2} onOpenChange={() => toggle('tier2')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <span className="text-xs font-medium">Tier 2 — Google Ads Healthcare</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${openTiers.tier2 ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 space-y-0.5">
            <CountBadge label="Prescription Drug Terms" count={scan.tier_2.prescription_drug_terms.found} details={scan.tier_2.prescription_drug_terms.details} />
            <CountBadge label="Drug Brand Names" count={scan.tier_2.drug_brand_names.found} details={scan.tier_2.drug_brand_names.details} />
            <CheckRow label="Direct Health Targeting" value={scan.tier_2.direct_health_targeting} />
            <CheckRow label="Outcome Guarantee" value={scan.tier_2.outcome_guarantee} />
            <CountBadge label="Sensitive Terms" count={scan.tier_2.sensitive_terms.found} details={scan.tier_2.sensitive_terms.details} />
            <CountBadge label="Landing Page Risk Terms" count={scan.tier_2.landing_page_risk_terms.found} details={scan.tier_2.landing_page_risk_terms.details} />
          </CollapsibleContent>
        </Collapsible>

        {/* Tier 3: Performance */}
        <Collapsible open={openTiers.tier3} onOpenChange={() => toggle('tier3')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <span className="text-xs font-medium">Tier 3 — Performance</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${openTiers.tier3 ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 space-y-0.5">
            {[1, 2, 3, 4].map(i => {
              const key = `post_${i}` as keyof typeof scan.tier_3.geo_keyword_first_100;
              return (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Post {i} Geo Keyword in First 100</span>
                  <PassFail value={scan.tier_3.geo_keyword_first_100[key] ? 'PASS' : 'FAIL'} />
                </div>
              );
            })}
            <CheckRow label="Service Keyword" value={scan.tier_3.service_keyword} />
            {[1, 2, 3, 4].map(i => {
              const key = `post_${i}` as keyof typeof scan.tier_3.word_count;
              const wc = scan.tier_3.word_count[key];
              const pass = wc >= 80 && wc <= 120;
              return (
                <div key={`wc-${i}`} className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">Post {i} Word Count</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{wc}w</span>
                    <PassFail value={pass ? 'PASS' : 'FAIL'} />
                  </div>
                </div>
              );
            })}
            <CheckRow label="Phone in 2+ Posts" value={scan.tier_3.phone_in_2_plus} />
            <CheckRow label="Keyword Diversity" value={scan.tier_3.keyword_diversity} />
            <CheckRow label="CTA Service Page" value={scan.tier_3.cta_service_page} />
            <CheckRow label="Neighbourhood in All" value={scan.tier_3.neighbourhood_in_all} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}