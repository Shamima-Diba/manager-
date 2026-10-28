# DELIVERY STATUS — manager 0.1.0

**Overall status: INCOMPLETE relative to the full requested product.**

This is a real source distribution with an implemented/tested manual editorial, CPU render and approved text-publication core. It is not an architecture-only proposal, not a fully delivered production application, and not production-ready. The required archive name `manager-complete.zip` is a filename, not a statement that all requested capabilities or acceptance criteria are met.

## Implemented

- React 19 / TypeScript / Vite static admin SPA with nineteen navigation areas, Bengali default navigation/font, English selection, dark/light themes, responsive mobile navigation, loading/errors/empty/offline states, real database counts and backend-result messages. Several areas explicitly report unimplemented capabilities rather than pretending they work.
- Supabase Auth client for email/password, signup, reset/password update and magic links. Configurable verified-email check for first workspace creation. Workspace roles, multi-membership, owner/admin invitations with expiry and matching verified email, owner role changes and final-owner protection.
- Three SQL migrations; all requested table names exist with tenant scope where applicable, RLS, composite tenant FKs, immutable content snapshots/hash, optimistic save conflicts, private Storage policies, Realtime publication and private secret segregation. Supporting schemas alone do not mean a feature is implemented.
- Manual article/evidence intake, fingerprint duplicate constraint, research classification notes, manual scripts, private image/video/audio uploads and two-minute signed previews.
- Enforced ASSET_GUARD on reviewed commercial/modifiable/non-editorial-only rights and SHA-256 byte verification; source/attribution manifest persisted in render metadata.
- SRT/VTT parsing, explicit user timing import/export, normalization/pronunciation dictionary utility; uploaded narration baseline.
- Durable pgmq render jobs, persistent steps, fencing, renewal, heartbeat, retry/backoff caps, dead-letter state, cancellation checks, bounded workspace concurrency/backpressure, atomic transactional enqueue and crash recovery.
- Real single-visual-input CPU FFmpeg renderer with optional uploaded narration, fixed Bengali caption template, ratios 9:16/16:9/1:1 and 720/1080 options, H.264/AAC MP4, thumbnail, ffprobe validation, checksums and temporary-file cleanup.
- Current-content-version approval with sensitive-review notes; backend-gated text publication to built-in website. Static generator emits crawlable HTML metadata, home/list/detail/categories/search/about/contact/RSS/sitemap/canonical URLs and correction note. Debounced queued rebuilds, full-site serialized generation and optional backend deploy-hook invocation.
- Mastodon official text-publishing adapter, stable publication idempotency, status readback before Published, manager scheduling, provider error categories, conservative provider cooldown and 429 retry delay. Uncertain transport/response/readback/crashed publisher is Unknown, never blindly retried.
- OAuth Edge Function source with fixed approved origin, state hash/expiry/single consumption, PKCE S256, server exchange, AES-GCM token encryption and disconnect/revocation; NOT deployed/live-tested.
- Audited manual closure of unknown publication outcomes without falsely labeling them published or reposting; operator-only procedure, no reconciliation UI.
- Vercel and Netlify SPA configurations; separate container worker and Nginx public site; optional GPU/Ollama Compose profile; annotated environment template; doctor/setup/smoke/package scripts; documentation, MIT license, CC0 fixtures, copied Bengali OFL license and npm dependency inventory.

## Tested locally

Environment observed: Linux sandbox, Node **22.23.4**, npm **10.9.9**, Python **3.12.3**, PostgreSQL **16.15**, actual **pgmq 1.5.1**, FFmpeg/ffprobe **6.1.1**, libass/libx264-enabled distro build, Noto Sans Bengali installed, headless Chromium from Playwright **1.64.1**. Final build dependencies: Vite **8.3.5**, plugin-react **6.1.2**, Vitest **5.0.5**, TypeScript **5.9.3**. Sources/tests were run on 2026-10-27. See actual non-secret output under docs/test-results/.

| Command / operation | Result | Scope / caveat |
|---|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS, clean reinstall from lockfile | Actual Node sandbox, no frontend/backend credentials |
| `npm run typecheck` | PASS | Apps/packages/scripts/tests; Deno Edge Functions deliberately excluded |
| `npm run build` | PASS | Production admin SPA output; not a hosted deployment |
| `npm test` | PASS: **33 tests in 4 files** | Actual FFmpeg/static-site tests; Mastodon is labeled local mock |
| `npm run smoke-test` | PASS | Real 2-second **720×1280 H.264/AAC MP4**, 24,735 bytes, explicit Bengali subtitles |
| `npm run test:e2e` | **1 passed, 1 skipped** | Unconfigured-state browser test passed; authenticated test skipped due no full Supabase/E2E credentials |
| `npm audit --json` | PASS: **0 reported vulnerabilities** | All installed production/development packages at audit time; not a security certification |
| `psql -v ON_ERROR_STOP=1 ... tests/integration/postgres-bootstrap.sql`, then all three migrations on a fresh DB | PASS | Actual PostgreSQL 16.15 + pgmq 1.5.1, minimum Auth/Storage schema fixtures; NOT full Supabase stack |
| `psql -v ON_ERROR_STOP=1 ... supabase/tests/authorization.sql` | PASS: **10 assertion notices** | Tenant/membership/storage isolation, viewer/role/invite/publish denial, final owner, approval/edit conflicts, public export exclusion |
| `psql -v ON_ERROR_STOP=1 ... supabase/tests/workflow.sql` | PASS: **13 assertion notices** | Licensing/sensitive gates, queue duplicate/fencing/renewal/completion, atomic rollback, restart, retry cap, schedule idempotency, unknown quarantine, cancellation |
| `TEST_DATABASE_URL=... node --import tsx tests/integration/worker-harness.ts` | PASS | Actual Node worker claims queue job under manager_worker_api, renders/uploads real 19,740-byte MP4, persists success and ACKs; actual approved article RPC then worker static build verified. **LOCAL HTTP Storage/PostgREST stub**, not hosted services |
| Inspect extracted `worker-frame.png` | PASS, manual visual inspection | Readable Bengali glyph shaping present; no claim of comprehensive typography/accessibility evaluation |
| `./scripts/doctor` with no .env | Expected nonzero setup result | Correctly reports missing server config, Storage unavailable; FFmpeg/ffprobe/Bengali font pass; providers Not configured |
| Docker Hub Node base tag metadata | HTTP 200 | Tag existence only; container build/run NOT tested |

Fresh-schema commands, worker harness setup and explicit stub limitations are documented in docs/testing.md. Temporary debugging failures (initial queue alias ambiguity, a reused mock Response body, browser shared-library prerequisites and harness cleanup ordering) were corrected and the relevant tests rerun; historical failed logs are not presented as passes.

### Not run

- **Full fresh local Supabase 17 stack / supabase db reset / actual Auth and Storage signing/upload:** Not run — Docker absent.
- **Deno Edge compilation, Edge deployment, live OAuth callback, real Mastodon publication/revocation:** Not run — no configured Supabase/provider credentials and no approved live account.
- **Authenticated full browser lifecycle including upload/review/scheduling:** Not run — missing local Supabase runtime/account credentials; included browser coverage is itself partial.
- **Vercel, Netlify, Nginx or worker-container deployment/image build:** Not run — no deployment credentials/Docker.
- **Ollama/vLLM/TTS/transcription, Bengali model quality, GPU:** Not run — services/weights/hardware/credentials not configured.
- **Load/security penetration/backup restore/production operations:** Not run — beyond available provisioned environment.

## Requires external credentials

Supabase project URL and public browser key, server Storage service-role key, dedicated database worker login, configured SMTP/Auth redirects, Mastodon application client ID/secret/approved instance and consenting account, exact OAuth callback/admin origins, random AES-256-GCM key and key ID in secret stores. Optional HTTPS model gateway/API key/model, optional private site build hook. No production secret was requested in chat, embedded in source, or included in the archive.

## Requires worker/GPU provisioning

A separate CPU host/container with FFmpeg, ffprobe, fontconfig/Noto Bengali, storage and outbound network access is mandatory for rendering/dispatch. Static frontend hosting does not provide this compute plane. GPU is NOT required for core rendering. Optional Ollama GPU profile requires separately provisioned NVIDIA hardware, drivers/container toolkit and independently reviewed model weights; merely starting Compose provisions none of these prerequisites.

## Not implemented

RSS/Atom fetcher, document extraction, automated source research/fact checking, integrated AI draft UI/jobs/budgets, actual TTS/transcription/media search provider, Pexels/Pixabay/Wikimedia acquisition, generative image/video, WordPress/Postiz/n8n, multi-scene/music/logo/intro/outro/headline/lower-third composition, configurable caption styling, artifact-specific approval/hash binding, approved public image/video promotion, public draft preview URL, separate scheduled website publishing, takedown UI/API, automatic unknown-post reconciliation, other social networks/media attachments, provider analytics/webhook pipeline, automation-rule execution, notifications, cost/budget enforcement, full MFA UI/enforcement, centralized monitoring/alerting, automatic retention/backups and tested disaster recovery. Some UI text remains English in Bengali mode.

## Known limitations

See docs/limitations.md for the full list. Key gaps: not all acceptance criteria are verified; public output is text-only; schema/record views are not complete feature implementations; whole Supabase stack untested; OAuth/real publishing untested; rendered video is privately previewable but not publishable through a complete reviewed-artifact workflow. Static updates require a build cycle, with a small directory promotion gap; hook acceptance is not deployment confirmation. Existing public snapshot remains after a private edit until republish/takedown. Pausing cannot recall an external request already in flight. UI permission awareness is incomplete and backend errors enforce access. Queue recovery does not promise exactly-once side effects.

## Security and licensing considerations

Documented DNS-rebinding TOCTOU / incomplete special-use IPv6 classification require external connection-time egress enforcement before untrusted production use. Worker database access is narrow but its Supabase Storage service-role key remains project-wide privileged. Application rate/budget/security hardening and independent review are incomplete. Provider credentials are AES-GCM encrypted; key rotation is manual. Use project isolation and secret management.

Application MIT, fixtures CC0, Bengali font SIL OFL; FFmpeg/libx264/container/dependency licenses remain separate. No model weights or third-party media are bundled. Provider account eligibility, app review, content rights, consent and disclosure obligations are operator responsibilities. No guarantees about reach, monetization or policy acceptance.

## Acceptance checklist

| ID | Status |
|---|---|
| A — clean lockfile install | PASS locally |
| B — typecheck and production build | PASS locally |
| C — migrations in fresh Supabase environment | **NOT VERIFIED**; fresh standalone PG16+real pgmq+Auth/Storage fixtures passed |
| D — RLS workspace isolation | PASS with actual PG RLS and explicit schema fixtures; actual Supabase Storage API integration not tested |
| E — create workspace/content | PASS at actual SQL RPC layer; authenticated browser path not run |
| F — durable worker render | PASS actual worker/queue/FFmpeg with labeled local Storage stub |
| G — licensed-fixture short MP4 | PASS actual output |
| H — approval before publication | PASS SQL guard/current-version tests |
| I — built-in public approved article | PASS actual approve/publish RPC → worker generator → static article HTML, under labeled local PostgREST stub |
| J — truthful unconfigured integration | PASS unconfigured browser state and source routes; no live provider claimed |
| K — verified real publishing contract + local contract test | PASS Mastodon adapter contract/tests; **NOT live-tested** |
| L — no blind uncertain retry | PASS local provider mapping and real queue unknown recovery tests |
| M — Vercel + Netlify configs | INCLUDED; deployment not run |
| N — actual source ZIP | Created by scripts/package.py at delivery; checksum delivered externally and reproducibility verified by delivery process |

**Do not interpret partial passes as full product acceptance. Deployment, load, security and live-provider validation remain separate incomplete gates.**
