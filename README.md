# Manager — Independent Publishing Platform

**Version 0.1.0 · incomplete source release · not production-ready.**

A standalone React SPA, Supabase data/authorization layer, durable pgmq jobs, CPU FFmpeg worker, static public news website, and official Mastodon publishing adapter. No hosted deployment or provider account is provisioned by this ZIP. Read [DELIVERY_STATUS.md](DELIVERY_STATUS.md) before deployment.

## Working core

Email/password, reset and optional magic-link clients; workspace creation (tenant-defined newsroom name); manually authored immutable articles; evidence notes; licensed private media registration and review; script snapshots; manually timed SRT/VTT validation; CPU render queue and MP4 preview; content review bound to current version; approved text article publication; static HTML/RSS/sitemap/category/search/about/contact generation; OAuth Mastodon text scheduling; durable publication outcomes; audit/job timelines. Authorization is enforced in SQL, not by UI visibility.

No AI credentials are needed for the manual path. No fake speech, simulated publishing success, demonstration counts, or invented engagement metrics are returned. Render previews are private. Public website media promotion and social media attachments are **not implemented**.

## Quick start

Prerequisites: Node 22.12+ (tested 22.23.4), npm 10+, Python 3 for packaging, Docker for the full local Supabase stack, Supabase CLI 2.122.0, FFmpeg with libass/libx264, ffprobe, Noto Bengali fonts. Production workers use Docker Compose. The optional GPU profile needs NVIDIA drivers/toolkit and separately licensed model weights.

```sh
npm ci
supabase start
supabase db reset
cp .env.example .env
# Set backend values locally; NEVER commit .env or paste secrets into chat.
# Put only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.local.
npm run dev
```

Confirm your email using the local Supabase mail viewer. Sign in and create your own newsroom workspace (for example **My Newsroom** / `my-newsroom`). This creates the first owner; no password is seeded. Set up the dedicated worker login per [worker deployment](docs/deployment-worker.md), then:

```sh
node --env-file=.env --import tsx apps/worker/src/main.ts
# Another terminal: validate environment (values are never printed)
./scripts/doctor
```

Core UI path: Content Studio → Asset Library (upload, then reviewer approval) → Script Editor / Voice & Subtitles (manual) → Video Factory → Editorial Review → Website CMS. Public-site publication is a **text snapshot** independent of the rendered video. For social publication connect Mastodon with administrator OAuth, then schedule the approved text/caption in Publishing Calendar. An owner can perform all these actions; other roles are enforced at the RPC layer.

```sh
npm run typecheck
npm run build
npm test
npm run smoke-test
npm run test:e2e
python3 scripts/package.py
```

`npm test` actually invokes FFmpeg. Fixture media is original CC0 geometric artwork, not downloaded stock. SQL tests are in `supabase/tests`; apply them with `psql -v ON_ERROR_STOP=1` to a disposable local Supabase database. See [testing](docs/testing.md) for the standalone PostgreSQL harness and exact scope distinctions.

## Deployment order

**Supabase → worker → admin frontend → public site → integrations.**

The admin frontend is a static SPA, deployable to Vercel or Netlify. It has no server, render daemon, or queue consumer. The public site is a **different artifact** containing pre-rendered article HTML. It must not use the SPA rewrite configuration. Docker Compose includes an Nginx public-site server at port 8080; add TLS/reverse proxy before internet exposure.

## Source map

- `apps/web`: Bengali-default responsive admin SPA, English language selection, light/dark themes.
- `apps/worker`: queue consumer, fencing, FFmpeg orchestration, Storage artifacts, publishing verification.
- `apps/public-site`: safe static generator; only approved published snapshots are exported.
- `packages/shared`: schemas, licensing gate, subtitle timing and state helpers.
- `packages/security`: URL checks, size bounds, redaction, authenticated token encryption.
- `packages/providers`: Mastodon contract, OpenAI-compatible/Ollama text adapters; other interfaces clearly unimplemented.
- `packages/render-engine`: deterministic CPU template and output validation.
- `supabase`: migrations, OAuth Edge Function, private buckets, RLS, durable queue, tests.
- `infra`, `scripts`, `docs`: deployments, doctor/smoke/package commands, runbooks.

## Distribution

`manager-complete.zip` is the requested **archive filename**, not a claim that every requested feature is implemented. It contains one root `manager/`, a manifest, lockfile, source, migrations, tests and documentation. It excludes dependencies, secrets, caches, generated media, and model weights. Reinstall dependencies and configure real services before use. Packaging fixes timestamps/modes and orders entries; repeat builds of the identical source with the same Python/zlib produce the same ZIP checksum.

License: application source MIT; original fixtures CC0; font SIL OFL 1.1; other components retain their own licenses. See THIRD_PARTY_NOTICES and docs/licensing.md.
