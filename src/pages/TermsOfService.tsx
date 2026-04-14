export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">Terms of Use</h1>
      <p className="text-sm text-muted-foreground mb-8">Version 1.0 — Effective Date: April 13, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Agreement and Acceptance</h2>
          <p>These Terms of Use ("Terms") constitute a legally binding agreement between VSA Vet Media Inc. ("VSA," "we," "us," or "our") and the licensed veterinary practice or veterinary practice group ("Client," "you," or "your") accessing the VSA SaaS Platform ("Platform") at portal.vsavetmedia.com.</p>
          <p className="mt-2">By accessing the Platform and completing the acceptance process, the primary account holder confirms that:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>They have read and understood these Terms in their entirety</li>
            <li>They are at least nineteen (19) years of age</li>
            <li>They are an authorized representative with full legal authority to bind the Client</li>
            <li>The Client agrees to be bound by these Terms and all policies incorporated herein</li>
            <li>They accept full responsibility for all activities conducted through the Client's account</li>
          </ul>
          <p className="mt-2 font-semibold">ACCESS TO THE PLATFORM IS RESTRICTED EXCLUSIVELY TO CLIENTS WITH AN ACTIVE SERVICE RELATIONSHIP WITH VSA. UNAUTHORIZED ACCESS IS STRICTLY PROHIBITED.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Definitions</h2>
          <p><strong>"Active Subscription"</strong> means the period during which the Client has an active service relationship and is in good standing with payment obligations.</p>
          <p className="mt-2"><strong>"Compliance Checker"</strong> means the AI-assisted regulatory compliance tool within the Platform.</p>
          <p className="mt-2"><strong>"Continuous Service Period"</strong> means the uninterrupted duration of the Client's Active Subscription as determined by VSA's billing records. A break resets the period to zero.</p>
          <p className="mt-2"><strong>"Design Files"</strong> means visual design source files (Figma files, exported assets, mockups, brand guides) — excluding source code, themes, plugins, and technical components.</p>
          <p className="mt-2"><strong>"Legacy Client"</strong> means any Client with an active service relationship prior to Platform launch.</p>
          <p className="mt-2"><strong>"New Client"</strong> means any Client whose first service relationship commenced on or after Platform launch.</p>
          <p className="mt-2"><strong>"Platform"</strong> means VSA's proprietary SaaS application at portal.vsavetmedia.com.</p>
          <p className="mt-2"><strong>"VSA IP"</strong> means all intellectual property owned by or licensed to VSA.</p>
          <p className="mt-2"><strong>"Website"</strong> means any website designed, developed, hosted, or managed by VSA on behalf of the Client.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Platform Access and Account</h2>
          <h3 className="font-semibold mt-3 mb-1">3.1 Primary Account Holder</h3>
          <p>The primary account holder accepts these Terms and holds administrative access, responsible for all account activity.</p>
          <h3 className="font-semibold mt-3 mb-1">3.2 Staff User Access</h3>
          <p>Staff users access the Platform as authorized users under a managed account. All staff activity is the primary account holder's responsibility. Staff users must acknowledge access terms on first login.</p>
          <h3 className="font-semibold mt-3 mb-1">3.3 Account Security</h3>
          <p>The Client is responsible for maintaining confidentiality of all credentials and promptly notifying VSA of unauthorized access.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Subscription, Billing, and Payment</h2>
          <h3 className="font-semibold mt-3 mb-1">4.1 Deferred Billing Model</h3>
          <p>Services are rendered for the initial 30-day period before the first invoice. Payment obligations accrue from the Start Date.</p>
          <h3 className="font-semibold mt-3 mb-1">4.2 Ongoing Billing</h3>
          <p>Monthly invoicing. VSA may adjust fees with 14 days advance written notice.</p>
          <h3 className="font-semibold mt-3 mb-1">4.3 Currency</h3>
          <p>Canadian Clients: CAD. US Clients: USD.</p>
          <h3 className="font-semibold mt-3 mb-1">4.4 Payment Processing</h3>
          <p>Processed through third-party payment processors selected by VSA.</p>
          <h3 className="font-semibold mt-3 mb-1">4.5 Late Payment Escalation</h3>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-muted"><th className="border border-border px-3 py-2 text-left">Timeline</th><th className="border border-border px-3 py-2 text-left">Action</th></tr></thead>
              <tbody>
                <tr><td className="border border-border px-3 py-2 font-medium">Day 15</td><td className="border border-border px-3 py-2">Invoice due date. Automated overdue notice issued.</td></tr>
                <tr><td className="border border-border px-3 py-2 font-medium">Day 30</td><td className="border border-border px-3 py-2">Second overdue notice. Direct contact with authorized representative.</td></tr>
                <tr><td className="border border-border px-3 py-2 font-medium">Day 45</td><td className="border border-border px-3 py-2">Formal written notice of pending suspension. 7 days to bring account current.</td></tr>
                <tr><td className="border border-border px-3 py-2 font-medium">Day 52</td><td className="border border-border px-3 py-2">Platform access suspended.</td></tr>
                <tr><td className="border border-border px-3 py-2 font-medium">Day 90</td><td className="border border-border px-3 py-2">Formal termination notice. Service agreement terminated. Recovery initiated.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">Interest accrues at 1.5% per month on overdue amounts.</p>
          <h3 className="font-semibold mt-3 mb-1">4.6 Billing Disputes</h3>
          <p>Disputes must be raised within 30 days of invoice date. VSA responds within 10 business days. Disputes after 30 days are deemed waived.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Cancellation</h2>
          <h3 className="font-semibold mt-3 mb-1">5.1 Client-Initiated Cancellation</h3>
          <p>30 days written notice required. Services continue through the notice period. No refunds for the notice period.</p>
          <h3 className="font-semibold mt-3 mb-1">5.2 Written Notice</h3>
          <p>Formal written communication by email or Platform channel. Verbal notice does not qualify.</p>
          <h3 className="font-semibold mt-3 mb-1">5.3 Tenure Reset on Cancellation</h3>
          <p className="font-semibold">IMPORTANT: Upon cancellation the Continuous Service Period resets to zero. Prior tenure does not carry forward under any circumstances.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Content Delivery and Deemed Approval</h2>
          <p><strong>6.1</strong> VSA delivers content on a scheduled basis. All AI-generated content is reviewed by VSA's editorial team.</p>
          <p className="mt-2"><strong>6.2</strong> Client has 5 business days to review and submit feedback.</p>
          <p className="mt-2"><strong>6.3</strong> If no feedback received within 5 business days, content is deemed approved and VSA proceeds with publication.</p>
          <p className="mt-2"><strong>6.4</strong> Client modifications after delivery — VSA bears no responsibility for consequences of Client-side modifications.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Compliance Checker</h2>
          <p>AI-assisted tool reviewing content against veterinary marketing standards. Not a guarantee of compliance. Client retains final editorial responsibility. Inline acknowledgment required before each use.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Client Responsibilities</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Maintain professional licenses and regulatory standing</li>
            <li>Provide accurate information to VSA</li>
            <li>Review all content prior to publication</li>
            <li>Protect Platform credentials</li>
            <li>Not reverse engineer, scrape, or copy the Platform</li>
            <li>Comply with all applicable laws and professional standards</li>
            <li>Maintain independent data copies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Client-Uploaded Materials</h2>
          <p>Client grants VSA a limited license to use uploaded materials for service delivery. Client warrants it has all necessary rights. Materials retained 30 days after termination then deleted.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Visual Content and Stock Imagery</h2>
          <p>Clients may not independently reuse VSA-sourced imagery without verifying license terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">11. Platform Availability</h2>
          <p>Platform provided as-is and as-available. VSA not liable for disruptions from third parties or force majeure.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">12. Feedback and Platform Improvement</h2>
          <p>Feedback provided to VSA becomes VSA's sole property and may be used for any purpose.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">13. Non-Solicitation</h2>
          <p>12-month non-solicitation period following termination regarding VSA personnel.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">14. Confidentiality</h2>
          <p>Mutual confidentiality obligations. Survives termination for 3 years.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">15. Good Faith and Corrective Action</h2>
          <p>VSA commits to prompt corrective action for identified errors, which satisfies obligations and limits liability to the corrective action itself.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">16. Limitation of Liability</h2>
          <p><strong>16.1</strong> VSA excludes all consequential, incidental, special, exemplary, or punitive damages.</p>
          <p className="mt-2"><strong>16.2</strong> Total liability capped at fees paid in the 3 calendar months preceding the claim.</p>
          <p className="mt-2"><strong>16.3</strong> Limitations apply regardless of legal theory.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">17. Indemnification</h2>
          <p>Client indemnifies VSA against claims arising from: breach of Terms, regulatory violations, failure to maintain licenses, publishing without required review, content modifications, third-party claims, and misrepresentations.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">18. Termination by VSA</h2>
          <p>VSA may terminate for: material breach (10-day cure period), non-payment per escalation framework, conduct posing risk, providing false information, or service agreement expiry. Client must revoke VSA access to third-party accounts within 5 business days of termination.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">19. Governing Law and Disputes</h2>
          <p>Governed by British Columbia law. Dispute resolution process: written notice → 30-day good faith negotiation → mediation → binding arbitration in Vancouver, BC. Client irrevocably submits to BC jurisdiction.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">20. General Provisions</h2>
          <p><strong>20.1 Amendments:</strong> Material changes require 14 days notice and re-consent. Non-material: 7 days. Legal/regulatory: immediate.</p>
          <p className="mt-2"><strong>20.2 Severability:</strong> Invalid provisions modified or severed; remainder continues.</p>
          <p className="mt-2"><strong>20.3 Waiver:</strong> Failure to enforce does not constitute waiver.</p>
          <p className="mt-2"><strong>20.4 Assignment:</strong> Client cannot assign without consent. VSA may assign to a successor entity.</p>
          <p className="mt-2"><strong>20.5 Succession:</strong> Terms bind successors and permitted assigns.</p>
          <p className="mt-2"><strong>20.6 Force Majeure:</strong> VSA not liable for circumstances beyond reasonable control.</p>
          <p className="mt-2"><strong>20.7 Language:</strong> Drafted in English.</p>
          <p className="mt-2"><strong>20.8 Conflict:</strong> Service agreement prevails for specific conflicts; Terms prevail otherwise.</p>
          <p className="mt-2"><strong>20.9 Entire Agreement:</strong> These Terms with the applicable service agreement constitute the entire agreement.</p>
        </section>

        <hr className="my-6 border-border" />

        <h2 className="text-xl font-bold mb-4">Intellectual Property and Service Terms</h2>

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Platform Ownership</h2>
          <p>The Platform and all components including software, source code, algorithms, databases, AI systems, and compliance frameworks are the exclusive IP of VSA. No rights transfer to the Client.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Platform-Stored Content</h2>
          <p>All content created, stored, or generated within the Platform constitutes VSA IP. No export rights upon termination.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Website IP — Tiered Entitlement</h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm border-collapse border border-border">
              <thead><tr className="bg-muted"><th className="border border-border px-3 py-2 text-left">Continuous Service Period</th><th className="border border-border px-3 py-2 text-left">Client Entitlement Upon Termination</th></tr></thead>
              <tbody>
                <tr><td className="border border-border px-3 py-2">Less than 24 continuous billing months</td><td className="border border-border px-3 py-2">Zero transfer. No rights acquired. VSA retains full ownership.</td></tr>
                <tr><td className="border border-border px-3 py-2">24 or more continuous billing months</td><td className="border border-border px-3 py-2">Design Files delivered upon written request within 30 days.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">Permanently excluded from transfer: source code, theme files, plugins, custom components, API keys, and proprietary systems.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Legacy Client Provisions</h2>
          <p>Legacy Clients' Continuous Service Period is measured from original Start Date. Those with 24+ continuous months are immediately eligible for Design File requests.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. New Client Provisions</h2>
          <p>Subject to full Terms from Platform acceptance date. Continuous Service Period begins on Start Date.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. License During Active Subscription</h2>
          <p>Limited, non-exclusive, non-transferable, revocable license to use the Website. Expires immediately upon termination.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Published Social Media Content</h2>
          <p>Published content remains on Client's channels. VSA retains all IP rights in underlying systems and methodologies.</p>
        </section>

        <p className="text-xs text-muted-foreground mt-8 pt-4 border-t">
          VSA Vet Media Inc. | Terms of Use | Version 1.0 | Effective Date: April 13, 2026 | Confidential — Authorized Clients Only
        </p>
      </div>
    </div>
  );
}
