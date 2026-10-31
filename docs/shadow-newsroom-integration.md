# Shadow newsroom integration (first live-safe connection)

This is an additive, inbound-only integration. Existing newsroom publishing remains authoritative. Manager receives copies of events and stores them for observation only.

## Live Manager backend

The integration migration and both Edge Functions have been deployed to the Manager Supabase project `dbxbbfqsgjzeqswpwjbk` (PostgreSQL 17, us-east-1).

- Admin endpoint: `https://dbxbbfqsgjzeqswpwjbk.supabase.co/functions/v1/integration-admin` (JWT required)
- Inbound event endpoint: `https://dbxbbfqsgjzeqswpwjbk.supabase.co/functions/v1/integration-ingest` (HMAC integration key required)
- Database inbox: `public.integration_events`
- Integration registry: `public.workspace_integrations`

## What happens

1. A Manager workspace owner/admin creates an integration using `integration-admin`.
2. Manager returns a random integration key once. Only its SHA-256 hash is stored in the database.
3. The existing newsroom backend sends an event copy to `integration-ingest` over HTTPS.
4. Each request includes a timestamp and HMAC-SHA256 signature over `<timestamp>.<raw JSON body>`, using the integration key.
5. Manager validates the credential, signature, five-minute timestamp window and event schema; it stores the event in a tenant-scoped inbox.
6. Repeated event IDs from the same integration are accepted as duplicates and are not stored twice.

**This is observation-only.** It does not call Automation King, read its database, change reporter/editor status, create a publication job, or publish/reject any story. The response includes `mode: shadow` and `publication_performed: false`.

## Create an integration

Call `POST /functions/v1/integration-admin` with a signed-in Manager user's Supabase JWT:

```json
{
  "workspace_id": "<manager-workspace-uuid>",
  "name": "BanglarVoice24News newsroom",
  "source_system": "automation_king"
}
```

The returned `integration_key` is displayed once. Save it in a server-side secret store, never in a mobile app, browser, source file or chat. If it is lost, disable that integration and create a replacement.

Disable with the same authenticated endpoint:

```json
{ "action": "disable", "workspace_id": "<workspace-uuid>", "integration_id": "<integration-uuid>" }
```

## Send a test event

Example Node.js sender (server-side only):

```js
import { createHmac } from "node:crypto";

const body = JSON.stringify({
  event_id: "report-2026-0001",
  event_type: "report.submitted",
  occurred_at: new Date().toISOString(),
  payload: {
    report_id: "fixture-0001",
    title: "Test reporter submission",
    status: "submitted"
  }
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", process.env.MANAGER_INTEGRATION_KEY)
  .update(timestamp + "." + body).digest("hex");

const response = await fetch(process.env.MANAGER_INGEST_URL, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-manager-integration-key": process.env.MANAGER_INTEGRATION_KEY,
    "x-manager-timestamp": timestamp,
    "x-manager-signature": "sha256=" + signature
  },
  body
});
console.log(response.status, await response.json());
```

The receiver accepts payloads up to 64 KiB, rejects nested credential-like keys, and requires timestamps within five minutes. Use a stable `event_id` for retries. The same integration/event ID pair is idempotent.

## Event contract

Required fields: `event_id`, `event_type`, `occurred_at` (ISO date-time), and object `payload`. Example event types include `report.submitted`, `report.updated`, `editor.review_requested`, `media.attached`, and `article.published`. Event names are not hard-coded to one newsroom's editorial policy.

Manager stores the event payload as an observation. It does not infer that a reporter submission is verified or approved. AI feedback is not yet wired to this receiver.

## Deployment boundary and next step

The Manager-side backend is live, but no Automation King sender has been installed and no BanglarVoice event has been received yet. To start the first shadow test, an owner/admin must create the integration in Manager, securely install the one-time key in the existing newsroom backend, and send a fixture event. This requires a small server-side sender change in the Automation King repository; it does not require a production database migration or publisher replacement. Keep the existing publisher as the only active publisher throughout shadow testing.
