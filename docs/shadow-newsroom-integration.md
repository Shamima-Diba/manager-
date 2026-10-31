# Shadow newsroom integration (first safe connection)

This is an additive, inbound-only integration. It lets an existing newsroom system send event copies to Manager while the existing publisher remains authoritative.

## What happens

1. A workspace owner/admin creates an integration using the `integration-admin` Edge Function.
2. Manager returns a random integration key once. The database stores only its SHA-256 hash.
3. The existing newsroom backend sends an event copy to `integration-ingest` over HTTPS.
4. Each request includes a timestamp and HMAC-SHA256 signature over `<timestamp>.<raw JSON body>`, using the integration key.
5. Manager validates the credential, signature, five-minute timestamp window and event schema; it stores the event in a tenant-scoped inbox.
6. Repeated event IDs from the same integration are accepted as duplicates and are not stored twice.

**This release is observation-only.** It does not call Automation King, read its database, change reporter/editor status, create a publication job, or publish/reject any story. The Manager response always includes `mode: shadow` and `publication_performed: false`.

## Create an integration

Call `POST /functions/v1/integration-admin` with a signed-in Manager user's Supabase JWT:

```json
{
  "workspace_id": "<manager-workspace-uuid>",
  "name": "BanglarVoice24News newsroom",
  "source_system": "automation_king"
}
```

The returned `integration_key` is displayed once. Save it in the existing newsroom backend's server-side secret store, never in a mobile app, browser, source file or chat. If it is lost, disable that integration and create a replacement.

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

Manager stores the event payload as an observation. It does not infer that a reporter submission is verified or approved. Future AI analysis/feedback must be a separate, versioned response contract and must never silently publish or reject.

## Deployment boundary

Apply the new migration and deploy these two Edge Functions only to a disposable/staging Manager project first. No Automation King production changes are required for Manager-side staging, but a real connection still requires a server-side sender in Automation King. Keep the existing publisher as the only active publisher throughout shadow testing.
