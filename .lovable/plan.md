## Plan: Connect Social Media Content Workflow End-to-End

### Current State
The pieces exist but have gaps:
- ✅ Intake form → generates content via edge function
- ✅ Content Requests tab shows generated versions
- ✅ Concierge "Send for Review" → Admin "Approve" → Client "Select"
- ✅ Admin Review page handles final approval → creates `content_posts` in calendar
- ❌ **No auto-approve when client doesn't act within 5 days on content_requests**
- ❌ **No `sent_to_client_at` timestamp tracked on content_requests**

### Changes

**1. Database Migration**
- Add `sent_to_client_at` and `auto_approve_at` columns to `content_requests` table
- These track when the request was sent to the client and when it should auto-approve

**2. Update ContentRequestsContent.tsx**
- When admin approves (status → `admin_approved`), also set `sent_to_client_at = now()` and `auto_approve_at = now() + 5 days`
- Show a countdown indicator for client-facing requests ("Auto-approves in X days")

**3. Update auto-approve-posts Edge Function**
- Add a second check: find `content_requests` where status = `admin_approved` and `auto_approve_at <= now()`
- For each expired request, auto-select the first (only) version, set status to `client_selected`
- Then run the same final-approve logic (create `content_posts` in calendar, set status to `final_approved`)

**4. Content Calendar Integration**  
- Already works — `content_posts` created during final approval show up in the calendar automatically

### Summary
- Add 2 columns to `content_requests` for auto-approve timing
- Update admin approve action to set the 5-day timer
- Extend the auto-approve edge function to handle content_requests → auto-create calendar posts
