# Crawlable public site and refresh mechanism

The generator emits article contents, title, description, canonical and Open Graph metadata directly in HTML. It also emits home, article lists, categories, search (public JSON index), about/contact, RSS, robots.txt and sitemap.xml. It never fetches private editorial content for public rendering. Public text is escaped, not trusted HTML. Browsers need no Supabase key for the generated files.

`publish_website` requires publisher permission and an approval matching current_version_id. It snapshots only approved text fields into website_posts. A rebuild request is upserted with a generation number and a 15-second debounce. The worker queues a site job, reads `public_site_data()` (an explicit allowlist of published fields), builds static HTML, and only clears the same generation. A later publication during a build leaves another rebuild pending. Rebuilding currently rebuilds all published workspaces; scoped partial page generation is not implemented. Draft edits do not silently alter existing public snapshots.

Compose serves `/site/current` directly with Nginx; host it behind TLS and point PUBLIC_SITE_ORIGIN to the public URL. The first article is unavailable until the worker completes a site build. Admin audit action says `website.published_pending_build`; it is not a guarantee of external deployment completion.

For a separate Vercel/Netlify public site, use a server-side build:

```sh
npm ci
node --env-file=.env --import tsx apps/public-site/src/build.ts
```

Publish `site-output`, with no SPA fallback. Use a separate deployment project and restrict any build identity to published data access. This implementation's export command uses service-role and therefore must run only in a trusted build environment, not a browser. An optional SITE_BUILD_HOOK triggers that external build/deploy pipeline after the local build. Hook secrets live only on the backend. HTTP accepted does NOT mean deployed; provider deployment monitoring and CDN invalidation are not implemented. Rebuild scheduling never claims universal realtime SEO updates.

Current limitations: text-only public articles, no approved asset promotion or video embeds, no standalone private draft-preview URL, no website scheduler separate from social scheduling, no public post takedown UI, no structured website navigation editor. Editors can review drafts in Content Studio; this is not a public preview endpoint. Takedowns require trusted SQL plus rebuild, described in runbooks.
