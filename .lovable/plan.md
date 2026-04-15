

## Plan: Configure Zoho Mail API Secrets

### What you provided
- **Client ID**: `1000.NSRVBJYJ3WQYIYKCCR012942ZSGY3Q`
- **Client Secret**: from the JSON file
- **Authorization Code**: from the JSON file (one-time use, must be exchanged for a refresh token)
- **Account ID**: `110000576741`

### Steps

**1. Exchange the authorization code for a refresh token**
The uploaded JSON contains an authorization code (`grant_type: authorization_code`), not a refresh token. I need to call the Zoho OAuth token endpoint to exchange it for a refresh token before it expires. This is a one-time exchange.

**2. Add 4 Supabase Edge Function secrets**
Once I have the refresh token, I'll add these secrets:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_ACCOUNT_ID` = `110000576741`

**3. Redeploy the `notify-terms-decline` edge function**
Ensure it picks up the new secrets so admin notification emails work when a client declines the terms.

### Important note
Authorization codes expire quickly (usually within a few minutes). If the code has already expired, you'll need to generate a new one from the Zoho API Console. I'll attempt the exchange immediately upon approval.

