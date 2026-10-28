# Netlify admin frontend

Import with repository root base. netlify.toml installs from lockfile and builds to apps/web/dist. The wildcard 200 rewrite is for the admin SPA only. Set Node 22.x (NODE_VERSION=22.23.0 in Netlify build settings) and the two public VITE_SUPABASE variables.

Set Auth redirects and APP_ORIGIN to your exact Netlify/custom domain; avoid sending secrets to preview builds. Security headers assume hosted Supabase domains. Never put rendering, GPU inference, queue consumers or backend secrets in frontend functions. A worker on its own host is required.

Netlify deployment NOT performed here. Local production build passed. Deploy the static public site as a separate site without SPA rewrite rules.
