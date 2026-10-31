import { mkdir, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { escapeHtml as e } from "../../../packages/shared/src/index.js";
export type PublicData = {
  workspaces: {
    id: string;
    slug: string;
    name: string;
    settings?: { description: string; about: string; contact: string };
  }[];
  posts: {
    workspace_id: string;
    slug: string;
    title: string;
    body: string;
    description: string;
    category: string;
    correction_note: string;
    published_at: string;
  }[];
};
const segment = (s: string) => encodeURIComponent(s);
export async function buildSite(data: PublicData, out: string, origin: string) {
  const u = new URL(origin);
  if (!["https:", "http:"].includes(u.protocol) || u.search || u.hash)
    throw Error("Public origin");
  const base = origin.replace(/\/$/, "");
  await mkdir(out, { recursive: true });
  const urls: string[] = [];
  const write = async (route: string, html: string) => {
    const p = path.join(out, route, "index.html");
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, html);
    urls.push(base + "/" + route.replace(/\/$/, ""));
  };
  const shell = (
    title: string,
    description: string,
    route: string,
    body: string,
  ) =>
    `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${e(base + "/" + route)}"><link rel="canonical" href="${e(base + "/" + route)}"><style>
:root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#e7eaf0;--paper:#fff;--canvas:#f5f7fb;--brand:#123b73;--accent:#d62828;font-family:Inter,"Noto Serif Bengali",system-ui,sans-serif}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--canvas);color:var(--ink);line-height:1.75;font-size:16px}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}header{background:var(--paper);border-bottom:1px solid var(--line);padding:22px max(20px,calc((100vw - 1180px)/2));box-shadow:0 4px 18px #17203308}
header h2{margin:0 0 14px;text-align:center;font-family:"Noto Serif Bengali",serif;font-size:clamp(25px,4vw,38px);line-height:1.35;font-weight:800;letter-spacing:-.02em}
header h2 a{color:var(--brand)}nav{display:flex;justify-content:center;align-items:center;gap:clamp(12px,2.3vw,28px);flex-wrap:wrap;border-top:1px solid var(--line);padding-top:13px}
nav a{font-size:14px;font-weight:700;color:#344054;white-space:nowrap}
body>h1,body>article,body>main,body>section{width:min(1180px,calc(100% - 40px));margin:26px auto}
body>h1{font-family:"Noto Serif Bengali",serif;font-size:clamp(25px,4vw,36px);line-height:1.4}
article{background:var(--paper);border:1px solid var(--line);padding:clamp(18px,3vw,30px);border-radius:14px;margin:18px auto;box-shadow:0 8px 24px #17203308}
article h1,article h2{font-family:"Noto Serif Bengali",serif;line-height:1.55;margin:0 0 12px}
article h1{font-size:clamp(25px,4vw,38px)}article h2{font-size:clamp(19px,2.4vw,25px)}
article p{color:#475467;margin:8px 0 14px}time{font-size:13px;color:var(--muted)}
.body{white-space:pre-wrap;overflow-wrap:anywhere;font-family:"Noto Serif Bengali",serif;font-size:18px;line-height:2.05}
input{padding:12px 14px;font:inherit;width:100%;border:1px solid #d0d5dd;border-radius:9px;background:#fff}
footer{margin-top:54px;padding:24px 20px;text-align:center;border-top:1px solid var(--line);background:#fff;color:var(--muted);font-size:13px}
:focus-visible{outline:3px solid #f59e0b;outline-offset:3px}
@media(max-width:600px){header{padding:16px 14px}nav{justify-content:flex-start;overflow-x:auto;flex-wrap:nowrap;padding:12px 2px 6px;gap:18px}nav a{font-size:13px}body>h1,body>article,body>main,body>section{width:calc(100% - 24px);margin:16px auto}article{padding:18px;border-radius:11px}.body{font-size:17px;line-height:1.95}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style></head><body>${body}<footer><p>Powered by manager · Human-reviewed publishing</p></footer></body></html>`;
  await write(
    "",
    shell(
      "Newsrooms",
      "Published workspaces",
      "",
      `<h1>Newsrooms</h1>${data.workspaces.map((w) => `<p><a href="/${segment(w.slug)}/">${e(w.name)}</a></p>`).join("")}`,
    ),
  );
  for (const w of data.workspaces) {
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(w.slug))
      throw Error("Unsafe workspace slug");
    const posts = data.posts.filter((p) => p.workspace_id === w.id);
    const home = segment(w.slug);
    const nav = `<header><h2><a href="/${home}/">${e(w.name)}</a></h2><nav><a href="/${home}/">Home</a><a href="/${home}/search/">Search</a><a href="/${home}/about/">About</a><a href="/${home}/contact/">Contact</a><a href="/${home}/rss.xml">RSS</a></nav></header>`;
    const cards = (items: typeof posts) =>
      items
        .map(
          (p) =>
            `<article><h2><a href="/${home}/articles/${segment(p.slug)}/">${e(p.title)}</a></h2><p>${e(p.description)}</p><time>${e(p.published_at)}</time></article>`,
        )
        .join("");
    await write(
      home,
      shell(
        w.name,
        w.settings?.description || "",
        home,
        nav + `<h1>Latest articles</h1>` + cards(posts),
      ),
    );
    for (const p of posts) {
      if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(p.slug))
        throw Error("Unsafe post slug");
      const route = `${home}/articles/${p.slug}`;
      await write(
        route,
        shell(
          p.title,
          p.description,
          route,
          nav +
            `<article><h1>${e(p.title)}</h1><time>${e(p.published_at)}</time><p><a href="/${home}/category/${segment(p.category)}/">${e(p.category)}</a></p><div class="body">${e(p.body)}</div>${p.correction_note ? `<aside><h2>Correction</h2>${e(p.correction_note)}</aside>` : ""}</article>`,
        ),
      );
    }
    for (const category of new Set(posts.map((p) => p.category))) {
      const route = `${home}/category/${segment(category)}`;
      await write(
        route,
        shell(
          category,
          w.name,
          route,
          nav +
            `<h1>${e(category)}</h1>` +
            cards(posts.filter((p) => p.category === category)),
        ),
      );
    }
    for (const page of ["about", "contact"] as const)
      await write(
        `${home}/${page}`,
        shell(
          page,
          w.name,
          `${home}/${page}`,
          nav +
            `<h1>${page}</h1><div class="body">${e(w.settings?.[page] || "Contact information has not been configured.")}</div>`,
        ),
      );
    // Search index contains only public snapshots; script uses DOM textContent, never HTML injection.
    await write(
      `${home}/search`,
      shell(
        "Search",
        w.name,
        `${home}/search`,
        nav +
          '<h1>Search</h1><label>Find published articles<input id="q" type="search"></label><div id="results"></div><script src="search.js" defer></script>',
      ),
    );
    await writeFile(
      path.join(out, home, "search", "index.json"),
      JSON.stringify(
        posts.map((p) => ({
          title: p.title,
          description: p.description,
          url: `/${home}/articles/${segment(p.slug)}/`,
        })),
      ),
    );
    await writeFile(
      path.join(out, home, "search", "search.js"),
      `fetch('index.json').then(r=>r.json()).then(items=>{const q=document.getElementById('q'),out=document.getElementById('results');q.addEventListener('input',()=>{out.replaceChildren();for(const p of items.filter(x=>(x.title+' '+x.description).toLowerCase().includes(q.value.toLowerCase()))){const a=document.createElement('a'),div=document.createElement('p');a.href=p.url;a.textContent=p.title;div.append(a);out.append(div);}});q.dispatchEvent(new Event('input'));});`,
    );
    await writeFile(
      path.join(out, home, "rss.xml"),
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${e(w.name)}</title><link>${e(base + "/" + home + "/")}</link><description>${e(w.settings?.description || w.name)}</description>${posts.map((p) => `<item><title>${e(p.title)}</title><link>${e(base + "/" + home + "/articles/" + segment(p.slug) + "/")}</link><guid>${e(base + "/" + home + "/articles/" + segment(p.slug) + "/")}</guid><description>${e(p.description)}</description><pubDate>${new Date(p.published_at).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`,
    );
  }
  await writeFile(
    path.join(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${e(url)}</loc></url>`).join("")}</urlset>`,
  );
  await writeFile(
    path.join(out, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
  );
  return { pages: urls.length, workspaces: data.workspaces.length };
}
export async function exportSite() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    origin = process.env.PUBLIC_SITE_ORIGIN;
  if (!url || !key || !origin) throw Error("Public site not configured");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("public_site_data");
  if (error) throw error;
  const target = path.resolve(process.env.SITE_OUTPUT_DIR || "site-output");
  const temp = target + ".next";
  await rm(temp, { recursive: true, force: true });
  const result = await buildSite(data, temp, origin);
  await rm(target + ".previous", { recursive: true, force: true });
  try {
    await rename(target, target + ".previous");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await rename(temp, target);
  await rm(target + ".previous", { recursive: true, force: true });
  return result;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  exportSite()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
