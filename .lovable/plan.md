# WhatsApp Photo & Chat Sync — Plan

## My recommendation

Go with the **official WhatsApp Business Cloud API (Meta)**, one dedicated business number, one WhatsApp group per clinic. Here's the honest tradeoff so you can decide with eyes open:

| Option | Works with your existing groups? | Risk | Cost | Fits Lovable/Supabase? |
|---|---|---|---|---|
| **Official Business Cloud API** (recommended) | No — clients must be moved into a new group that includes your business number | None (fully compliant) | ~$0 for first 1,000 conversations/mo, then ~$0.005–0.05 per message | Yes — webhook → Supabase edge function |
| Unofficial bridge (whatsapp-web.js, Baileys) | Yes — mirrors your current personal groups | High — violates WhatsApp ToS, number can be banned without warning, breaks every WA update | Server cost only | No — needs a persistent 24/7 Node process holding a QR session; Supabase edge functions can't do this, would need a separate VPS |

The unofficial route is tempting because it "just works" with your current groups, but a ban wipes out the entire clinic's chat history and takes your team's phone number down with it. Not worth it for a client-facing product.

## What we'll build (official path)

**One WhatsApp group per clinic**, each group includes your VSA business number as a participant. Every photo/video/message sent in the group is delivered to a Meta webhook, which our edge function stores against that clinic.

### User-visible additions
- **Clinic Detail → new "WhatsApp" tab**: shows the group's linked status, invite instructions, and a live media grid (photos/videos with sender name + timestamp) plus a text chat log.
- **Media library filter** on the existing clinic media pages so WhatsApp-sourced files are browsable alongside uploads.
- **Admin setup screen** to paste the Meta credentials once and to link each clinic to its WhatsApp group ID.

### Backend
- New Supabase table `clinic_whatsapp_groups` (clinic_id, wa_group_id, group_name, linked_at) with RLS + grants.
- New table `whatsapp_messages` (clinic_id, wa_message_id, sender_name, sender_wa_id, body, media_path, media_type, sent_at) with RLS + grants.
- Storage: reuse the existing public `department-files` bucket under `whatsapp/{clinic_id}/…`.
- Edge function `whatsapp-webhook` (verify_jwt = false, verifies Meta's `X-Hub-Signature-256`): handles verification handshake, receives message events, downloads media via Meta's media endpoint, uploads to Supabase Storage, inserts row.
- Edge function `whatsapp-link-group`: admin-only, associates an incoming group with a clinic.
- Realtime enabled on `whatsapp_messages` so the tab updates live.

### Secrets to add (I'll request when we start building)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET` (for webhook signature verification)
- `WHATSAPP_VERIFY_TOKEN` (any random string we generate)

## What you need to do on Meta's side (one-time, ~30 min)
1. Create a Meta Business account + WhatsApp Business App at developers.facebook.com.
2. Add a phone number (a fresh one, not tied to a personal WhatsApp).
3. Generate a permanent access token and note the Phone Number ID + App Secret.
4. Point the webhook to the edge function URL I'll give you after step 1 of the build.
5. For each clinic: create a group, add the business number, then from admin UI paste the group ID once.

## Limitations you should know
- Meta only forwards **group messages that include the business number as a member** — we can't read arbitrary existing groups.
- Message history before the number joins is not backfilled — only forward from link time.
- Voice notes, docs, images, videos all supported; stickers and location pins supported too.

## Technical notes (for reference)
- Webhook uses Meta Cloud API v20+ payload shape (`entry[].changes[].value.messages[]`).
- Media fetched via `GET /{media-id}` → signed URL → download with bearer token → upload to Storage.
- Deduplication via unique index on `wa_message_id`.
- No PII stored beyond WhatsApp display name + wa_id (already visible to group members).

Approve this and I'll start with the migration + edge function, then walk you through the Meta console step-by-step.