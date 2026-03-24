

## Update Domain References to `portal.vsavetmedia.com`

### What needs to change

Now that the app is hosted at `portal.vsavetmedia.com`, we need to update all hardcoded fallback URLs and meta tags that still reference `vet-dash-suite.lovable.app`.

### Changes

**1. Edge Functions — update fallback FRONTEND_URL (2 files)**

- `supabase/functions/google-oauth/index.ts` line 16: change fallback from `"https://vet-dash-suite.lovable.app"` to `"https://portal.vsavetmedia.com"`
- `supabase/functions/meta-oauth/index.ts` line 18: same change

These are fallbacks when `SITE_URL` env var isn't set. The OAuth flows already pass `window.location.origin` dynamically, but the fallback should be correct.

**2. Set `SITE_URL` secret in Supabase**

Add/update the `SITE_URL` secret to `https://portal.vsavetmedia.com` so edge functions use the correct domain.

**3. Update `index.html` meta tags**

- Line 23: `og:title` → "VSA Vet Media Portal" (instead of "Lovable App")
- Line 24: `twitter:title` → "VSA Vet Media Portal"
- Line 25: `og:description` → "VSA Vet Media Content Platform"
- Line 26: `twitter:description` → "VSA Vet Media Content Platform"
- Line 21: `twitter:site` → remove `@Lovable` or set to your brand handle
- Line 9: `author` → "VSA Vet Media"

**4. Update Google & Meta OAuth app settings (manual, your side)**

In Google Cloud Console and Meta Developer portal, add `https://portal.vsavetmedia.com` to the list of authorized redirect URIs / allowed domains. The existing Supabase callback URLs stay the same — only the frontend origin needs whitelisting.

### No changes needed

- `window.location.origin` calls in Login, MetaConnectionCard, GoogleAdsConnectionCard — these automatically resolve to whatever domain the user is on
- Privacy/data deletion pages — those reference `vsavetmedia.ca`/`vsavetmedia.com` email addresses which are correct
- Supabase redirect URI (`supabase.co/functions/v1/...`) — unchanged, this is the OAuth callback endpoint

