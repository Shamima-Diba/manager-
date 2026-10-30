# Connector and Automation Implementation Decision

Status: accepted implementation direction for the Manager feature branch.
Scope: additive changes only; no hosted database changes, deployment, OAuth app registration, or live publishing.

## Decision

Build a native Manager connector control plane on the existing Supabase + TypeScript worker foundation. Do not add Nango or n8n as a runtime dependency in this release.

Why:
- Manager already has tenant-scoped workspaces, a private encrypted social-secret store, an OAuth state table, a Supabase Edge Function, and a durable worker/delivery ledger.
- Nango is a strong integration-auth product: it supports OAuth 1.0a/2.0, API keys, refresh handling, and many APIs. However, self-hosting introduces a separate service and operational footprint; its free self-hosted feature set is limited and the project uses the Elastic License. It does not remove the need for provider-specific publishing adapters or app review.
- n8n is a capable workflow automation product, but adding it would create a second workflow runtime, another authorization/tenant boundary, and additional hosting/operations. Manager needs publication-specific idempotency, approvals, tenant isolation, and receipts to remain authoritative in its own database.
- Native adapters keep the user experience in Manager and make each provider's permissions, capabilities, and failure semantics explicit.

## User experience

Keep the existing menu names. Implement their actual functions:
1. News Sources: Add RSS/Atom, supported public website metadata, WordPress/API and webhook sources; test, enable/pause, set polling interval, display last fetch and error.
2. Social Accounts: one Connect flow, then provider-specific consent; allow multiple accounts per workspace; show account/page/channel, granted scopes, token health, test, reconnect, disconnect.
3. Automation Rules: simple WHEN / IF / THEN builder; draft/test mode first; per-rule enable/pause; run history and per-action receipts.
4. Integrations: provider catalog, environment/configuration status, required setup and permissions.

## Authentication model

Use one Manager OAuth broker with provider adapters, not one fake universal OAuth endpoint:
- Common broker responsibilities: authenticated workspace admin, one-time hashed state, PKCE where supported, exact redirect URI, callback validation, token exchange, encrypted token persistence, least-privilege scopes, refresh/revocation, account discovery, audit events, and reconnect state.
- Provider adapters own authorization/token endpoints, scopes, account discovery, API version headers, refresh rules, publishing formats, rate limits, and remote read-back verification.
- Tokens remain server-side in the existing encrypted secret store. Browser clients receive only connection metadata and status. Never log tokens or authorization codes.
- A connection is not "healthy" merely because OAuth returned: perform a provider identity/capability check and store granted scopes and health timestamp.
- Support multiple independent connections for the same provider/workspace. Do not key uniqueness on provider alone.

## Provider reality (do not mislabel everything OAuth)

- Mastodon: OAuth 2.0; existing adapter is the first supported path.
- Facebook Pages / Instagram Professional: Meta OAuth and Graph API permissions; account/page discovery and app review/advanced access can be prerequisites.
- LinkedIn: OAuth 2.0; organization publishing requires Community Management API access, w_organization_social, and an eligible page role; member posting uses w_member_social.
- X: OAuth 2.0 Authorization Code with PKCE and user-context scopes such as tweet.write; application-only bearer tokens are not a substitute for user publishing.
- YouTube: Google OAuth 2.0 with offline access and youtube.upload; video upload is a distinct media workflow and quota-governed.
- Telegram: Bot API token, not a generic end-user OAuth flow. User creates a bot and grants it channel posting rights.
- WordPress: REST API Application Password or supported OAuth/plugin setup; provider/site-specific.
- RSS/Atom: no OAuth for public feeds; private feeds may use a separately supported credential mode.
- Custom APIs: explicit API key, OAuth2, or signed-webhook mode configured per connector.

Provider availability must be capability-gated. Never display an account as publish-ready until the relevant API permission and target account role are verified.

## Source ingestion

Use the existing news_sources and source_items tables as the starting point. Add source polling metadata and durable leases/cursors. A worker:
- claims due sources with FOR UPDATE SKIP LOCKED and a bounded lease;
- fetches HTTPS only, with timeouts and strict byte/content-type limits;
- blocks loopback, private, link-local, multicast and reserved IP destinations, validates redirects and DNS resolution at connection time, and rejects credential-bearing URLs;
- sends If-None-Match / If-Modified-Since when available and records ETag/Last-Modified;
- parses RSS 2.0 and Atom safely, normalizes canonical URL, title, summary, author and published timestamp;
- fingerprints stable source identifiers/canonical URLs and inserts with conflict-safe deduplication;
- records fetch result, last success, next poll, and sanitized errors.
Do not scrape arbitrary page bodies as a default. Prefer RSS/Atom, official APIs, sitemaps and user-authorized CMS endpoints.

## Automation execution

Keep rule definitions declarative and versioned. First supported triggers: source item ingested, content approved, scheduled time. First supported conditions: source, category, language, keyword and workspace tags. First actions: create a content draft, request human review, create platform-specific draft, or plan a delivery against an already-connected destination.

Rules must not directly bypass editorial approval or the publication ledger. Every action becomes a durable idempotent job; retries are bounded, uncertain external outcomes go to reconciliation, and per-destination delivery receipts are recorded. Default new rules to disabled / dry-run. No auto-publication until the workspace owner explicitly enables that rule and the destination is active.

## Implementation order

1. Generic connection schema and OAuth broker foundation; keep Mastodon backward-compatible.
2. Add provider adapters in order: Meta Pages, LinkedIn, X, Google/YouTube; Telegram bot-token connector separately.
3. Build the account picker, connection health, test/reconnect/disconnect UI.
4. Implement RSS/Atom poller with SSRF-safe fetching, leases, deduplication and tests.
5. Implement rule evaluation, dry-run preview, durable action jobs and run history.
6. Add WordPress/custom API adapters and media capabilities.
7. Run isolated provider tests with user-owned test accounts and receipts; then shadow compare.
8. Production rollout requires separate explicit authorization.

## Required secrets/configuration (never put values in Git)

Each provider app needs administrator-configured client ID/secret and exact callback URI in Supabase Edge Function secrets. Names should be provider-specific (for example META_CLIENT_ID, META_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, X_CLIENT_ID, X_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). Existing token encryption key remains server-only. No secret values are requested or stored in this document.

## Acceptance criteria

A feature is complete only when:
- tenant isolation and RLS tests pass;
- OAuth state/PKCE, callback replay, wrong workspace, wrong origin and token encryption tests pass;
- multiple same-provider accounts coexist;
- provider identity and required scopes are verified;
- token refresh/revocation and reconnect are tested where supported;
- RSS/Atom ETag/304, malformed XML, oversized body, timeout, redirect, SSRF and duplicate tests pass;
- rule dry-run and action idempotency tests pass;
- every publish adapter verifies provider receipt/read-back or records an uncertain result without blind retry;
- CI passes on the PR head.
