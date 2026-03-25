export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last Updated: March 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using the VSA Vet Media Portal ("Platform"), operated by VSA Vet Media ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree, you may not access or use the Platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
          <p>The Platform is a digital marketing management portal designed for veterinary clinics. It provides tools for reporting, analytics, content management, and campaign monitoring across services including website management, SEO, Google Ads, and social media marketing.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Eligibility</h2>
          <p>You must be at least 18 years of age and authorized to enter into these Terms on behalf of yourself or the veterinary practice you represent. By using the Platform, you represent and warrant that you meet these requirements.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. User Accounts</h2>
          <p>Access to the Platform requires an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized use of your account.</p>
          <p className="mt-2">We reserve the right to suspend or terminate accounts that violate these Terms or are inactive for an extended period.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Authorized Use</h2>
          <p>You agree to use the Platform only for lawful purposes and in accordance with these Terms. You may not:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li>Use the Platform in any way that violates applicable laws or regulations</li>
            <li>Attempt to gain unauthorized access to any part of the Platform or its systems</li>
            <li>Interfere with or disrupt the integrity or performance of the Platform</li>
            <li>Use automated tools to scrape, crawl, or extract data from the Platform</li>
            <li>Impersonate any person or entity or misrepresent your affiliation</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Third-Party Integrations</h2>
          <p>The Platform integrates with third-party services including Google Ads, Meta (Facebook/Instagram), and Google Analytics. By connecting your accounts, you authorize us to access and display performance data from these services on your behalf, in read-only reporting capacity.</p>
          <p className="mt-2">We do not modify, create, or manage campaigns or ads through these integrations. Your use of third-party services is also subject to their respective terms of service and privacy policies.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Data and Privacy</h2>
          <p>Your use of the Platform is also governed by our <a href="/privacy-policy" className="text-primary underline hover:text-primary/80">Privacy Policy</a>, which describes how we collect, use, and protect your information in compliance with PIPEDA and PIPA (British Columbia).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Intellectual Property</h2>
          <p>All content, design, code, and branding on the Platform are the property of VSA Vet Media and are protected by Canadian and international intellectual property laws. You may not reproduce, distribute, or create derivative works from any part of the Platform without our prior written consent.</p>
          <p className="mt-2">Content generated for your clinic (e.g., social media posts, marketing copy) remains your property once delivered and approved.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Service Availability</h2>
          <p>We strive to keep the Platform available at all times but do not guarantee uninterrupted access. We may temporarily suspend access for maintenance, updates, or circumstances beyond our control. We will make reasonable efforts to provide advance notice of planned downtime.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, VSA Vet Media shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform. This includes, but is not limited to, loss of data, revenue, or business opportunities.</p>
          <p className="mt-2">Our total liability for any claim arising from these Terms or your use of the Platform shall not exceed the fees paid by you to VSA Vet Media in the twelve (12) months preceding the claim.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">11. Indemnification</h2>
          <p>You agree to indemnify and hold harmless VSA Vet Media, its officers, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from your use of the Platform or violation of these Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">12. Modifications to Terms</h2>
          <p>We may update these Terms from time to time. Material changes will be communicated through the Platform or via email. Continued use of the Platform after changes are posted constitutes acceptance of the revised Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">13. Termination</h2>
          <p>Either party may terminate the use of the Platform at any time. We reserve the right to suspend or terminate your access if you breach these Terms. Upon termination, your right to use the Platform ceases immediately.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">14. Governing Law</h2>
          <p>These Terms are governed by and construed in accordance with the laws of the Province of British Columbia and the federal laws of Canada applicable therein. Any disputes arising from these Terms shall be resolved in the courts of British Columbia.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">15. Contact Us</h2>
          <p>If you have questions about these Terms of Service, please contact us:</p>
          <p className="mt-2">
            <strong>VSA Vet Media</strong><br />
            Email: info@vsavetmedia.ca<br />
            Website: <a href="https://vsavetmedia.ca" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">vsavetmedia.ca</a>
          </p>
        </section>
      </div>
    </div>
  );
}
