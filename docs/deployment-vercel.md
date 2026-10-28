# Vercel admin frontend

Import this repository with project Root Directory set to the repository root. Use root vercel.json: build `npm ci && npm run build`, output `apps/web/dist`. The admin UI is a static SPA, with navigation fallback to index.html. Node 22.x is recommended.

Set ONLY VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend build environment. Rebuild after changing them; Vite embeds these public values. Do not add service-role, database, OAuth, token-encryption, provider or build-hook secrets to Vercel frontend env. The Supabase public/anon key is not a secret and depends on effective RLS.

Update Supabase Auth redirect allowlist, APP_ORIGIN and Mastodon callback prerequisites for the deployed admin domain. CORS supports one exact origin per Edge deployment. Security headers in vercel.json assume hosted `*.supabase.co`; adapt them deliberately for a custom Supabase domain. No rendering, FFmpeg or persistent worker runs in Vercel functions.

Deployment NOT performed here. This is configuration plus a locally successful production build, not a verified Vercel deployment.

Do NOT deploy the public website using the admin SPA fallback: see deployment-public-site.md.
