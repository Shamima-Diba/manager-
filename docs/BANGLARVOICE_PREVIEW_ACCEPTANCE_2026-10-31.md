# Banglar Voice 24 / Manager Preview Acceptance Report — 2026-10-31

## Status

**PARTIAL — NOT READY FOR PRODUCTION OR LIVE PUBLICATION.** Manager remains a private backend/CMS. The public news site is a separate Vercel project. No production cutover, live publication, Automation King change, or Supabase production migration was performed.

## Branch and source changes

- Repository: `Shamima-Diba/manager-`
- Branch: `feat/banglarvoice-public-news-experience-2026-10-31`
- Latest source commit at report creation: `e376a5969db33de9a6612973ddfc0fbd5af430fa`
- Earlier responsive public-site CSS foundation: `799b81c08fa9706dc1164e2f269f2d178e00cfdb`
- Added migration: `supabase/migrations/20261031010000_public_site_approved_snapshot.sql`
- Updated `apps/public-site/src/build.ts` to use the anonymous read-only export key, validate the RPC response shape, and restore the previous output directory if promotion fails.
- Updated `.env.example` and `docs/deployment-public-site.md` to document the read-only export contract.

## Backend evidence (read-only)

Supabase project `dbxbbfqsgjzeqswpwjbk` was inspected using read-only SQL:

- Workspace: `banglar-voice-24` / `Banglar Voice 24 news`.
- `publishing_paused=false`.
- Current counts: `content_items=0`, `website_posts=0`, `approvals=0`.
- Existing `public.public_site_data()` reads from legacy `website_posts` and does not currently join the current `content_items` version and matching approval.
- Applied migration list includes `20261031003459_shadow_newsroom_integrations` and the three 20261027 core migrations. The existing branch migrations `202610310001_independent_publication_destinations` and `202610310002_publication_worker_dispatch` were not present in the applied migration list.
- The new approved-snapshot migration is committed to the feature branch only. It has **not** been applied to the live Manager Supabase project.

The new RPC contract exports only a website snapshot whose content item is approved, non-sensitive, still points at the snapshot version, and has a matching `approvals.decision='approved'` record. It is read-only and does not return drafts or private editorial metadata.

## Vercel evidence

### Private Manager

- Project: `manager--apps` (`prj_E4Ixlpuam0JUDtIq7QxaUfrpvpEM`)
- Preview branch variable `VITE_SUPABASE_URL` is configured only for `feat/banglarvoice-public-news-experience-2026-10-31`.
- Latest checked deployment: `dpl_B7b5LKiMykGGcFwsDMQXKRdBuPYq`, state `READY`, commit `e376a5969db33de9a6612973ddfc0fbd5af430fa`.
- Build output is still the Manager Vite SPA (`vite build apps/web`); it is not evidence that the public site was built or that authenticated CMS workflows were browser-tested.

### Separate public-site project

- Created Vercel project: `banglarvoice-public-preview` (`prj_TCJnpRfU7W6fdgX9S84BqOWzuye4`).
- SSO protection is enabled for all deployment targets.
- Supabase URL, publishable key, and output directory are scoped to Preview and the feature branch only; no production environment variables were created.
- Initial Git deployment failed with `missing_lock_file` because the repository uses Yarn v1 (`yarn.lock`), not `package-lock.json`; the project install command was corrected to `yarn install --frozen-lockfile` and Node was pinned to `24.x`.
- The initial failed deployment was marked target `production`, state `ERROR`; no production deployment became live. After project settings were corrected, Vercel reported no latest deployment and no attached domains.
- No successful public-site Preview deployment exists yet. It is intentionally not claimed as complete while the live database still has no approved content and the new RPC migration is unapplied.

## Acceptance matrix

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Public snapshot contract | IMPLEMENTED IN BRANCH | Migration committed; not applied or database-tested against isolated Preview |
| Read-only export key | IMPLEMENTED IN BRANCH | Generator now expects `SUPABASE_ANON_KEY`; no service-role key used by the public exporter |
| Output rollback | IMPLEMENTED IN BRANCH | Promotion rollback path added; unit test not rerun in this execution |
| Manager Preview build | READY | Vercel READY; admin SPA only |
| Public-site Preview build | BLOCKED | No approved data and migration not applied; initial project install command was corrected |
| Manager website settings/navigation controls | INCOMPLETE | Existing Website CMS page only publishes approved article snapshots |
| Breaking-news Realtime UI | NOT IMPLEMENTED / UNVERIFIED | No acceptance test evidence |
| Newsletter subscription/queue/worker | NOT IMPLEMENTED / UNVERIFIED | No acceptance test evidence |
| AI greeting + RAG/BM25/pgvector | NOT IMPLEMENTED / UNVERIFIED | No acceptance test evidence |
| TTS browser/cloud fallback | NOT IMPLEMENTED / UNVERIFIED | No acceptance test evidence |
| Desktop and 375px browser screenshots | NOT VERIFIED | Browser screenshot tooling was not available in this execution |
| End-to-end Manager → public rendering | BLOCKED | No isolated Preview database/content and no successful public-site deployment |

## Safety boundaries observed

- No Supabase migration or SQL mutation was run.
- No production environment variable was added or changed.
- No live publication or external deployment was triggered.
- No Automation King project or its credentials were accessed or modified.
- The public-site Vercel project has SSO protection and no successful deployment.
- The Manager application remains a private control-plane project.

## Required next gates

1. Provision an isolated Supabase Preview/staging database for this branch; do not apply the new migration to the active Manager database as a substitute.
2. Apply the branch migrations in order to that isolated database and run SQL assertions proving draft, stale-version, sensitive, rejected, and unapproved content are excluded while current approved content is exported.
3. Add a reviewed, non-sensitive test article and verify the full `content_items → approval → website_posts snapshot → public_site_data RPC → static HTML` path.
4. Trigger an explicit Vercel Preview deployment for the public-site project (target Preview, never Production) and verify article, category, RSS, sitemap, canonical URLs and no private metadata.
5. Extend Manager Website CMS with editable site settings, header/navigation, breaking-news, newsletter, AI/RAG and TTS controls; implement server-side authorization and durable workflow receipts for each.
6. Run `npm test`, `npm run typecheck`, `npm run build`, database integration tests, authenticated browser E2E, and 375px/desktop visual verification.
7. Keep both PR and deployments in Preview until the acceptance matrix is green. Production cutover requires a separate explicit approval.

**Conclusion:** The safe export contract and separate protected Vercel project foundation are now in the feature branch, but the requested complete Manager-controlled live website has not been delivered or verified.
