## Goal
Send the real branded "Ticket Completed" email to `ishan@vsavetmedia.ca` so we can preview exactly what clients receive.

## Changes

1. **Edit `supabase/functions/notify-ticket-completed/index.ts`**
   - Accept optional `testRecipient` (string) in the request body.
   - When present: skip the owner + sub-account lookup, render the same branded template using a real completed ticket's data, and send only to `testRecipient`. Response includes `testMode: true`.
   - When absent: behavior is unchanged (owner + sub-accounts).

2. **Deploy the function** with `deploy_edge_functions`.

3. **Trigger the test send** via `curl_edge_functions`:
   - `POST /notify-ticket-completed`
   - body: `{ "ticketId": "1a18fa7d-3179-4382-a321-363839f52a84", "testRecipient": "ishan@vsavetmedia.ca" }`
   - (Uses the most recently completed Website ticket "Time Changes Request" as the data source.)

4. **Verify** by reading the function logs to confirm Zoho returned success.

## Notes
- No DB / schema changes.
- Override is harmless to leave in for future QA, but I can remove it after if you prefer — let me know.
