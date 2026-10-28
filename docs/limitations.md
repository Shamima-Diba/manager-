# Explicit remaining scope

This release prioritizes a real manual-content/CPU-render/approved-text-publication core. It does NOT complete the entire requested product. The ZIP filename is not a completeness certification.

- Authenticated whole-system browser vertical slice not run; local Supabase and live credentials were unavailable. SQL and actual worker rendering were tested with explicit Auth/Storage contract fixtures/stub.
- UI has all 19 navigation areas, but some are truthful status/record views: automation execution, analytics ingestion and most integrations are not implemented. This is not evidence those features work.
- Bengali default navigation and font are implemented; detailed form/operator strings are partly English. No comprehensive accessibility audit or screen-reader test was run.
- AI text adapter source exists (Ollama / OpenAI-compatible including vLLM), schema validation and safe HTTPS boundary, but no UI/job wiring, retries/concurrency/budget policy, key-management UI or live model tests. TTS/transcription/media search are interfaces only, not working provider integrations.
- News intake is pasted evidence/URL metadata only, not RSS/Atom fetching, document extraction or automated allowlist/blocklist ingestion.
- Rendering is a single visual input (image or clip), optional uploaded narration, fixed Bengali subtitle style, explicit duration, aspect/resolution, MP4/thumbnail/checksum/manifest. Multi-scene composition, logo, music mixing, intro/outro, headline/lower-thirds and configurable subtitle appearance are not implemented.
- Human content-version review exists; artifact-specific immutable approval/hash bindings and separate publisher handoff UI are not implemented. Private render preview is not approval.
- Built-in public site is crawlable text-only HTML/RSS/sitemap/categories/search/about/contact. No approved public image/video promotion, public draft-preview links, website-specific publish scheduling, design editor, SEO field editor beyond description/title, or takedown UI. Existing public snapshots persist after later draft edits until intentional republish/takedown.
- Mastodon text OAuth/post/readback/disconnect source and local contract tests are implemented, not live-tested. No video/image uploads, auto-refresh abstraction, OAuth token-expiry discovery, account health polling, analytics, webhooks or other social networks. Instance character limits can differ; >500 text rejected locally by schema; grapheme-aware platform validation not implemented.
- Stable schedule idempotency, retry caps, queue recovery/fencing, per-workspace concurrency=1 and conservative provider cooldown exist. No exactly-once remote side effects. Automatic reconciliation is not implemented; unknown outcomes are quarantined. Operator-only audited manual cancellation is available.
- No application budget enforcement, precise usage costing, retention cleanup, malware scanning, centralized alerts, full webhook security pipeline, automatic backups or tested disaster recovery.
- SSRF URL validation has a documented DNS-rebinding TOCTOU gap and incomplete special-use IPv6 coverage; enforce network egress before untrusted production use.
- Worker Storage uses privileged project-wide service-role. DB worker RPC role is narrow, but this Storage risk remains. Key rotation is manual; Supabase Auth MFA guidance, not application MFA UI/enforcement.
- Container versions are pinned tags, not digests; OS packages are not snapshot-pinned. Container build/deployment and GPU profile untested.
- Public-site rebuild is full-site and serialized, with 15-second debounce; deployment hooks are accepted requests, not deployed-status verification. Directory swap has a small non-atomic gap. Multi-host shared-output coordination not implemented.

Before production: complete missing capabilities, run a real Supabase-stack vertical slice, test each external account, close security gaps, validate deployment images, load-test, review licenses, run a restore drill and obtain independent security review.
