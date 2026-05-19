## Goal
Make sub-accounts receive every email the parent client receives.

## Current state (audit)
I checked every email-sending edge function:

| Edge function | Sends to client? | Includes sub-accounts? |
|---|---|---|
| `notify-content-approval` (monthly calendar review) | Yes | ✅ Already — filtered by `sub_account_clinics` for that clinic |
| `notify-ticket-completed` | Yes | ✅ Already — filtered by `sub_account_clinics` for that clinic |
| `notify-ticket-created` | No — internal staff only | n/a |
| `notify-terms-decline` | No — alerts admins | n/a |
| `request-password-reset` | Per-email user only | n/a (each user uses their own) |
| `resend-welcome-email` | Sends client welcome | ❌ Admin-triggered; not called for sub-accounts |
| `create-sub-account` | — | ❌ **No welcome email sent at all** |

So the only real gap is the **welcome email**: when a parent client creates a sub-account, the sub-account never gets a "set your password / welcome" email.

## Plan

### 1. Send a welcome email automatically from `create-sub-account`
After the sub-account row + clinic assignments are inserted successfully, send a branded welcome email using the same Zoho + `generateLink('recovery')` pattern as `resend-welcome-email`, but with sub-account-appropriate copy:

- Subject: `"You've been invited to VSA Vet Media"`
- Body mentions which parent clinic/client invited them and lists the clinics they were given access to
- Includes a "Set your password" button (recovery link, 60-min TTL) + "Go to sign in" link
- Skips the long "beta access" marketing paragraph used for primary clients — sub-accounts are operational logins, not new client onboarding
- Failure to send the email does **not** roll back the sub-account creation (just log + return a non-fatal warning in the response, same pattern used elsewhere)

### 2. No changes needed to existing client notifications
`notify-content-approval` and `notify-ticket-completed` already loop sub-accounts via `sub_account_clinics` for the relevant clinic, so they will automatically deliver to sub-accounts whenever the parent gets the email. I'll leave them alone.

### 3. Optional admin-side "Resend welcome" for sub-accounts (ask)
Currently `resend-welcome-email` is admin-only and targets primary clients. If you want admins (or the parent client) to be able to re-send the sub-account welcome from the Sub Accounts page, I can extend that — but it's not required to fulfill "sub accounts receive the same emails."

## Technical notes
- Reuse `_shared/zoho-mail.ts` (`sendZohoEmail`, `brandedEmailWrapper`) and `_shared/password-reset-link.ts` (`getResetPasswordUrl`, `withCanonicalRedirect`)
- Look up parent clinic names from the `clinic_ids` already in scope to personalize the email
- No DB schema changes
- No frontend changes (the UI in `src/pages/SubAccounts.tsx` keeps working as-is)

## Question for you
Do you also want a **"Resend welcome email" button** on the Sub Accounts page (item 3), or just the automatic send on creation (items 1–2)?
