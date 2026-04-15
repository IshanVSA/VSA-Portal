

## Plan: Update Zoho Mail API Secrets

The user has provided verified Zoho CA credentials. I will:

1. **Update 4 secrets** with the new values:
   - `ZOHO_CLIENT_ID` = `1000.EAZ8JAFKY3TTYKFB3C42QA3KDSPRJD`
   - `ZOHO_CLIENT_SECRET` = `4d240dc1223167c2181499e693930f8547a91fea1a`
   - `ZOHO_REFRESH_TOKEN` = `1000.eb0cb588afe40d29a90e3c7131406978.95530571648988a64db7b8452d298a53`
   - `ZOHO_ACCOUNT_ID` = `110000576741`

2. **Send a test email** to `ishan@vsavetmedia.ca` to verify the integration works end-to-end.

### Technical Details
- The `notify-terms-decline` edge function already uses Zoho CA endpoints (`accounts.zohocloud.ca` / `mail.zoho.ca`)
- No code changes needed, only secret updates

