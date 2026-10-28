# Security assessment and boundaries

This source has **not** received a penetration test, load test, independent security review, live OAuth validation, or hardened production deployment. A clean npm audit is a point-in-time advisory check, not proof of safety.

## Enforced controls

- SQL membership checks, tenant RLS, composite tenant foreign keys; direct sensitive mutations revoked.
- Owner-only role change, final-owner preservation, verified email invitation matching, random hashed invitation tokens with 48-hour expiry. No invitation email delivery service is included; admins send tokens through a secure channel.
- Reviewer approval bound to immutable article version. Editing invalidates reuse and cancels still-scheduled publications. Sensitive defaults true, with required review notes; semantic sensitive-topic detection is not implemented.
- Private buckets; insert-only browser uploads; exact workspace/asset paths and database registration; private preview URLs expire after two minutes. ASSET_GUARD blocks production renders with pending/unknown/incompatible rights and verifies content SHA-256 on download.
- File type inspection with ffprobe, size/dimension/duration limits, FFmpeg argument arrays (no shell), file/pipe input protocols, isolated temp files, timeout and cleanup. Processes execute native parsers on untrusted data; run them in a patched, network-restricted container. Per-job seccomp/VM isolation and malware scanning are not included.
- AES-256-GCM encrypted tokens, key IDs, no browser SELECT on secrets; single-use OAuth state, PKCE and exact Origin/CORS for authenticated actions.
- Plain-text articles/scripts escaped in public HTML; no arbitrary editorial HTML is rendered. Build/rewrite security headers restrict admin origin resources.
- Server/worker keys never use VITE_ prefix. Structured logs redact common credential fields. Do not log raw OAuth/provider response bodies.

## SSRF and outbound policy

safeFetch requires public HTTPS (port 443), blocks loopback/private/link-local/reserved IPv4 and common prohibited IPv6 ranges, resolves all addresses, rejects credentials and redirects, and applies timeout. Downloads are byte-bounded. Mastodon origin is fixed by the administrator. Storage downloads use only the exact configured Supabase origin; local HTTP Supabase is an explicitly trusted development exception.

**Known gap:** DNS validation followed by ordinary fetch leaves a DNS-rebinding TOCTOU window; IPv6 special-use coverage is not an exhaustive IANA registry implementation. The application is NOT claimed SSRF-complete. Use an egress proxy/firewall denying private/link-local/metadata destinations at connection time and allow only approved provider/Supabase hosts before exposing to untrusted tenants. No user-submitted URL fetching/RSS engine is exposed in this release; manual URLs are stored as evidence, not fetched.

## Privilege and key rotation

Worker DB role can invoke bounded RPCs only, but the Storage service-role key remains project-wide privileged. Edge functions also hold service-role for validated OAuth mediation. Isolate them, restrict network access and use secret stores. A narrow authenticated Storage broker is not implemented.

TOKEN_KEY_BASE64 decodes to 32 random bytes; TOKEN_KEY_ID must match the stored token row. Rotation is manual: pause all dispatch, snapshot secret rows with encrypted database backup, run a trusted offline migration that decrypts each old envelope with old key and re-encrypts with new key/new IV, update Edge and worker secrets atomically, test one account, resume. Keep old key securely until all rows are migrated; then retire. Never relabel a key ID without re-encryption. No automated rotation command is shipped.

## Remaining risks / pre-production gates

No app-level auth request throttler, robust OAuth start abuse limiter, workspace usage budget enforcement, webhook signature/replay pipeline, malware scanner, or comprehensive field-level authorization audit. Hosted Supabase Auth rate limits and network WAF are required but not a substitute for future application controls. OpenAI/Ollama structured responses are schema-validated but evidence is not automatically fact-checked. Model endpoints are operator-controlled; no provider key UI exists. MFA guidance only; enforcement/enrollment UI not implemented.

The UI shows available actions and relies on backend rejection for permission-denied feedback. Role-aware button hiding is not a security control and is incomplete. Some detailed form copy remains English in Bengali mode. No offline write queue exists: offline state warns and operations fail honestly.

## Kill switches and takedown

Workspace pause UI prevents new dispatches and direct website publication; it cannot recall provider requests already in flight. Global switch is private operator SQL:

```sql
update manager_private.system_settings set publishing_killed=true where singleton;
```

Global switch does not delete already public HTML or provider posts. Use the operational takedown procedures. There is no anonymous worker command endpoint. Unsupported webhooks are not implemented, rather than accepted without signature validation.
