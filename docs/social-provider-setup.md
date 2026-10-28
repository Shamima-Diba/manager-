# Social capabilities and setup

## Capability matrix

| Provider | Auth | Permissions | Eligibility | Formats | Scheduling | Analytics | Review | Implemented | Live-tested | Limits |
|---|---|---|---|---|---|---|---|---|---|---|
| Mastodon >=4.3 | OAuth code + PKCE S256 | read:accounts, read:statuses, write:statuses | Account on administrator-approved instance that accepts your app | Text only, <=500 app characters | manager worker dispatches due posts | Not implemented | Instance registration/rules; no blanket approval promise | OAuth Edge source, statuses adapter, confirmation GET, disconnect | No | Instance limits vary, no attachments, no unknown-post search |
| Facebook / Instagram / YouTube / TikTok / X / LinkedIn | Not implemented | Platform-specific, not requested by this application | Platform-specific | Not implemented | None | None | May require app review/account eligibility | No | No | No claims of identical capabilities |
| Postiz | Not implemented / optional future bridge | Review external contract before adding | Separate infrastructure | None in this release | None | None | External requirements | No | No | Not bundled, not hosted in Supabase |

Mastodon was chosen because it provides an official documented publishing route without browser cookies or account passwords. The application collects OAuth consent, not platform passwords. Contract reference: https://docs.joinmastodon.org/methods/statuses/ and https://docs.joinmastodon.org/methods/oauth/ (retrieved during implementation). Local HTTP mocks test request forms, error mapping and confirmation; they are NOT live publishing validation.

## Setup

1. Select a fixed public Mastodon HTTPS origin, ideally version 4.3+ for PKCE. Approve it in your worker egress policy. Do not accept arbitrary origins from ordinary users.
2. Register an application on that instance (Preferences → Development, or its official app registration endpoint) using the exact callback `https://PROJECT.supabase.co/functions/v1/social-oauth/callback` and scopes above.
3. Store client ID/secret, approved origin, exact admin APP_ORIGIN and callback in Edge secret storage. Generate a cryptographically random 32-byte encryption key locally; keep its base64 value in TOKEN_KEY_BASE64 and identifier in TOKEN_KEY_ID. The same key and identifier are required on the worker. Never paste values into chat.
4. Deploy the social-oauth Edge Function and configure strict Origin/CORS. Sign in as workspace owner/admin and click Social Accounts → Connect with OAuth.
5. Check the returned account name. Approve an immutable article version; a publisher then schedules its caption. Calendar uses browser local timezone and sends UTC.
6. Observe states: scheduled by manager → dispatching/submitted → published only after GET readback. A lost response/readback failure is unknown, never a green success toast.

OAuth state is random, stored as SHA-256, expires in ten minutes and is consumed before token exchange. PKCE verifier is server-side only. Token exchange uses the confidential client server-side. Stored access token is AES-256-GCM encrypted with key ID and random 96-bit IV; no browser secret grants. There is no refresh-token flow because this implementation uses Mastodon's access-token behavior, not a universal cross-provider refresh abstraction. NULL expiry means expiry was not supplied, not a promise of permanent validity. Revocation fails visibly instead of pretending to disconnect if the remote call failed.

Idempotency-Key is set per stable publication request; official retention is up to **one hour**. Scheduling is done by manager, not Mastodon scheduled_at. Conservative shared provider cooldown and 429 handling do not replace actual instance policies. The adapter is text-only; no AI disclosure/altered-media API metadata is sent. For sensitive text, use explicit caption disclosure and editorial notes; native cross-platform metadata is not implemented.

## Uncertain outcome

If a POST might have been accepted, do not schedule a replacement just to try again. Inspect the account at the provider and worker correlation logs; record the remote ID/URL if found. A publisher can call `resolve_unknown_publication` with at least 20 characters of evidence and p_cancel=true to close the pending record without reposting. It **cannot** label an unverified record Published. Automatic reconciliation and UI for this RPC are not implemented. Use operator SQL/RPC tooling with the publisher's authenticated session, or escalate to an administrator. Provider tokens should never be copied to a browser console.

Postiz/n8n are not dependencies. If added later, pin their actual versions, verify their real API/hosting stack, and review current license/embedding terms; no license conclusion is implied here.
