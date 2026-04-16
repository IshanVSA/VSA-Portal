import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TermsBlockedScreen } from "./TermsBlockedScreen";
import { getClientIp } from "@/lib/get-client-ip";

interface Props {
  currentVersion: string;
}

export function TermsAcceptanceModal({ currentVersion }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [caslConsent, setCaslConsent] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) setScrolledToBottom(true);
  }, []);

  const handleAccept = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const ip = await getClientIp();
      const { error } = await supabase.from("terms_acceptance_log").insert({
        user_id: user.id,
        terms_version: currentVersion,
        acceptance_type: "client",
        user_agent: navigator.userAgent,
        casl_consent_given: caslConsent,
        ip_address: ip,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["terms-acceptance"] });
    } catch (e: any) {
      toast.error("Failed to record acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const ip = await getClientIp();
      await supabase.from("terms_decline_log").insert({
        user_id: user.id,
        terms_version: currentVersion,
        ip_address: ip,
      });
      // Notify admins
      try {
        await supabase.functions.invoke("notify-terms-decline", {
          body: { user_id: user.id, terms_version: currentVersion },
        });
      } catch {}
      setDeclined(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (declined) return <TermsBlockedScreen />;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      <div className="bg-background border rounded-lg shadow-lg max-w-3xl w-full mx-4 flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="p-6 pb-2 border-b">
          <h2 className="text-xl font-semibold">Privacy Policy & Terms of Use</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Version {currentVersion} — Please review and accept to continue.
          </p>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6"
          onScroll={handleScroll}
          style={{ maxHeight: "55vh" }}
        >
          <TermsContent />
        </div>

        {!scrolledToBottom && (
          <p className="text-xs text-muted-foreground text-center py-2 border-t bg-muted/30">
            ↓ Please scroll to the bottom to enable acceptance
          </p>
        )}

        <div className="p-6 pt-4 border-t space-y-4">
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(!!v)}
                disabled={!scrolledToBottom}
              />
              <span className="text-sm leading-relaxed">
                I have read and understood the VSA Vet Media Inc. Privacy Policy and Terms of Use in their entirety and agree to be bound by them.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={caslConsent}
                onCheckedChange={(v) => setCaslConsent(!!v)}
                disabled={!scrolledToBottom}
              />
              <span className="text-sm leading-relaxed">
                <strong>Canadian Clients:</strong> I consent to receiving commercial electronic messages from VSA in connection with my service agreement.
              </span>
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={submitting}
              className="flex-1"
            >
              I Have Concerns
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!agreed || !scrolledToBottom || submitting}
              className="flex-1"
            >
              {submitting ? "Processing..." : "Accept and Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
      <h2 className="text-lg font-bold mt-0">PART ONE — Privacy Policy</h2>

      <h3>1. Who We Are</h3>
      <p>VSA Vet Media Inc. ("VSA," "we," "us," or "our") is a veterinary-exclusive digital marketing agency incorporated under the laws of British Columbia, Canada, with its principal place of business in Vancouver, British Columbia. We provide digital marketing services exclusively to licensed veterinary practices and veterinary practice groups through our proprietary SaaS platform ("Platform").</p>
      <p>This Privacy Policy governs how VSA collects, uses, discloses, retains, and protects information processed through the Platform. It applies solely to licensed veterinary clinics and veterinary practice groups ("Clients" or "you") who have an active service relationship with VSA.</p>

      <h3>2. Scope and Applicability</h3>
      <p>This Policy applies to all data processed by VSA through the Platform in connection with the delivery of contracted services to Clients across all Canadian provinces and territories and all fifty United States of America.</p>
      <p><strong>Governing Privacy Frameworks:</strong> PIPEDA (Federal Canada), PIPA (British Columbia), CCPA/CPRA (California), and applicable privacy statutes in all other US states where Clients operate.</p>

      <h3>3. Information We Collect</h3>
      <p>VSA collects: third-party integration data (analytics, advertising, SEO), AI-generated content data, client-uploaded materials, platform usage data (login activity, session timestamps, terms acceptance records), business and account information, and communication data.</p>

      <h3>4. How We Use Your Information</h3>
      <p>VSA uses information solely for delivering contracted services including: performance reports, AI-assisted content creation, advertising campaign management, SEO monitoring, platform security, billing, and compliance record-keeping.</p>
      <p><strong>VSA does not sell, rent, trade, or otherwise transfer Client data to any third party for commercial purposes under any circumstances.</strong></p>

      <h3>5. AI and Automated Content Generation</h3>
      <p>VSA utilizes AI-powered tools for content generation, compliance checking, and service delivery. AI-generated content is subject to human review by VSA's editorial team prior to delivery. AI-generated content does not constitute legal advice or a guarantee of regulatory compliance. Final responsibility rests with the Client.</p>

      <h3>6. Third-Party Service Integrations</h3>
      <p>The Platform integrates with third-party services including analytics, advertising, SEO, AI, CRM, and payment platforms. Each maintains its own privacy practices.</p>

      <h3>7. Analytics and Tracking Infrastructure</h3>
      <p>Analytics data collected through VSA-managed properties is accessible to and retained by VSA as part of its service delivery infrastructure.</p>

      <h3>8. Personnel and Extended Service Team</h3>
      <p>VSA's team may include authorized personnel located outside of Canada and the United States, operating within VSA's systems under confidentiality obligations.</p>

      <h3>9. Visual Content and Imagery</h3>
      <p>VSA may use client-provided photos, AI-generated imagery, and licensed stock imagery. Clients are granted limited usage rights subject to applicable licensing terms.</p>

      <h3>10. Data Retention</h3>
      <p>Client data is retained during the active subscription. Upon termination: uploaded materials retained 30 days then deleted; platform-stored content retained as VSA IP; terms acceptance logs retained permanently; billing records retained as required by law.</p>

      <h3>11. Evolving Platform and Integrations</h3>
      <p>VSA may add new tools and integrations. Material changes to data processing will be notified through the Platform.</p>

      <h3>12. Data Security</h3>
      <p>VSA implements role-based access controls, encryption in transit, segregated client environments, confidentiality obligations, and append-only terms acceptance logs. In the event of a confirmed breach, affected Clients will be notified within 72 hours.</p>

      <h3>13. Team Member Information and Removal</h3>
      <p>VSA operates dual-pathway removal: clinic request (actioned within 5 business days) and individual direct request to privacy@vsavetmedia.ca (actioned within 5 business days regardless of clinic authorization).</p>

      <h3>14. Privacy Rights</h3>
      <p><strong>Canadian Clients:</strong> Access, correction, withdrawal of consent, and complaint rights under PIPEDA and PIPA. <strong>US Clients:</strong> Rights to know, delete, correct, opt-out of sale (VSA does not sell data), and non-discrimination.</p>

      <h3>15. Cross-Border Data Transfers</h3>
      <p>Client data may be transferred to jurisdictions outside Canada. VSA ensures compliance with applicable privacy law and confidentiality protections.</p>

      <h3>16. CASL Compliance</h3>
      <p>Canadian Clients consent to receiving commercial electronic messages from VSA. This consent may be withdrawn at any time.</p>

      <h3>17. Changes to This Privacy Policy</h3>
      <p>Material amendments: 14 days notice. Non-material: 7 days notice. Legal/regulatory: effective immediately.</p>

      <h3>18. Contact</h3>
      <p>VSA Vet Media Inc. — Privacy and Compliance Team, Vancouver, British Columbia, Canada. Email: privacy@vsavetmedia.ca</p>

      <hr className="my-6" />

      <h2 className="text-lg font-bold">PART TWO — Terms of Use</h2>

      <h3>1. Agreement and Acceptance</h3>
      <p>These Terms constitute a legally binding agreement between VSA and the Client. By accessing the Platform, the account holder confirms they have read and understood the Terms, are at least 19 years of age, and have authority to bind the Client.</p>
      <p><strong>ACCESS TO THE PLATFORM IS RESTRICTED EXCLUSIVELY TO CLIENTS WITH AN ACTIVE SERVICE RELATIONSHIP WITH VSA.</strong></p>

      <h3>2. Definitions</h3>
      <p>Key definitions: "Active Subscription," "Compliance Checker," "Continuous Service Period," "Design Files," "Legacy Client," "New Client," "Platform," "Start Date," "VSA IP," and "Website" — as defined in the full Terms document.</p>

      <h3>3. Platform Access and Account</h3>
      <p>VSA grants a limited, non-exclusive, non-transferable, revocable right to access the Platform. The primary account holder is responsible for all account activity including staff users.</p>

      <h3>4. Subscription, Billing, and Payment</h3>
      <p>Deferred billing model with monthly invoicing. Late payment escalation: Day 15 overdue notice, Day 30 second notice, Day 45 formal suspension notice, Day 52 suspension, Day 90 termination. Interest: 1.5% per month. Billing disputes must be raised within 30 days.</p>

      <h3>5. Cancellation</h3>
      <p>30-day written notice required. Tenure resets to zero upon cancellation — prior tenure does not carry forward.</p>

      <h3>6. Content Delivery and Deemed Approval</h3>
      <p>5 business day review window. If no feedback received, content is deemed approved and VSA proceeds with publication.</p>

      <h3>7. Compliance Checker</h3>
      <p>AI-assisted tool that reviews content against veterinary marketing standards. Not a guarantee of compliance. Client retains final editorial responsibility.</p>

      <h3>8. Client Responsibilities</h3>
      <p>Maintain professional licenses, provide accurate information, review content before publication, protect credentials, maintain own data copies.</p>

      <h3>9. Client-Uploaded Materials</h3>
      <p>Client grants VSA a limited license to use uploaded materials for service delivery. Materials retained 30 days after termination then deleted.</p>

      <h3>10. Visual Content and Stock Imagery</h3>
      <p>Clients may not independently reuse VSA-sourced imagery without verifying license terms.</p>

      <h3>11. Platform Availability</h3>
      <p>Platform provided as-is. VSA not liable for disruptions from third-party failures or force majeure.</p>

      <h3>12. Feedback and Platform Improvement</h3>
      <p>Client feedback becomes VSA property and may be used for platform improvement.</p>

      <h3>13. Non-Solicitation</h3>
      <p>12-month non-solicitation period following termination regarding VSA personnel.</p>

      <h3>14. Confidentiality</h3>
      <p>Mutual confidentiality obligations survive termination for 3 years.</p>

      <h3>15. Good Faith and Corrective Action</h3>
      <p>VSA commits to prompt corrective action for identified errors, which satisfies its obligations and limits liability.</p>

      <h3>16. Limitation of Liability</h3>
      <p>VSA excludes consequential damages. Direct liability capped at fees paid in the 3 months preceding the claim.</p>

      <h3>17. Indemnification</h3>
      <p>Client indemnifies VSA against claims arising from breach, regulatory violations, content modifications, misrepresentations, and third-party claims.</p>

      <h3>18. Termination by VSA</h3>
      <p>VSA may terminate for material breach (10 day cure), non-payment, conduct posing risk, or false information. Client must revoke VSA access to third-party accounts within 5 business days.</p>

      <h3>19. Governing Law and Disputes</h3>
      <p>Governed by British Columbia law. Dispute resolution: written notice → 30-day negotiation → mediation → binding arbitration in Vancouver. Client irrevocably submits to BC jurisdiction.</p>

      <h3>20. General Provisions</h3>
      <p>Amendments require re-consent. Material changes: 14-day notice. Severability, waiver, assignment restrictions, succession, force majeure, English language, conflict resolution between documents, and entire agreement provisions apply.</p>

      <hr className="my-6" />

      <h2 className="text-lg font-bold">PART THREE — Intellectual Property</h2>

      <h3>1. Platform Ownership</h3>
      <p>The Platform and all components are exclusive VSA IP. No rights transfer to the Client.</p>

      <h3>2. Platform-Stored Content</h3>
      <p>All content created within the Platform remains VSA IP. No export rights upon termination.</p>

      <h3>3. Website IP — Tiered Entitlement</h3>
      <p><strong>Under 24 months:</strong> Zero transfer. <strong>24+ months:</strong> Design Files delivered upon written request. Source code, themes, plugins, and technical components are permanently excluded.</p>

      <h3>4–5. Legacy & New Client Provisions</h3>
      <p>Legacy Clients' continuous service period is measured from the original Start Date. New Clients begin from the Platform acceptance date.</p>

      <h3>6. License During Active Subscription</h3>
      <p>Limited, non-exclusive, non-transferable, revocable license to use the Website. Expires immediately upon termination.</p>

      <h3>7. Published Social Media Content</h3>
      <p>Published content remains on Client's channels. VSA retains IP rights in underlying systems and methodologies.</p>

      <p className="text-xs text-muted-foreground mt-8">
        VSA Vet Media Inc. | Privacy Policy and Terms of Use | Version 1.0 | Effective Date: April 13, 2026 | Confidential — Authorized Clients Only
      </p>
    </div>
  );
}
