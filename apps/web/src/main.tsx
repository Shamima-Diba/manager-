import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient, Session } from "@supabase/supabase-js";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/600.css";
import "./style.css";
import { parseSubtitles, subtitles } from "../../../packages/shared/src/index";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
type Row = Record<string, any>;
const nav = [
  ["dashboard", "ড্যাশবোর্ড", "Dashboard"],
  ["content", "কনটেন্ট স্টুডিও", "Content Studio"],
  ["sources", "সংবাদ উৎস", "News Sources"],
  ["research", "তথ্য যাচাই", "Research & Fact Review"],
  ["scripts", "স্ক্রিপ্ট সম্পাদক", "Script Editor"],
  ["assets", "অ্যাসেট লাইব্রেরি", "Asset Library"],
  ["voice", "ভয়েস ও সাবটাইটেল", "Voice & Subtitles"],
  ["video", "ভিডিও ফ্যাক্টরি", "Video Factory"],
  ["review", "সম্পাদকীয় পর্যালোচনা", "Editorial Review"],
  ["website", "ওয়েবসাইট CMS", "Website CMS"],
  ["social", "সামাজিক অ্যাকাউন্ট", "Social Accounts"],
  ["calendar", "প্রকাশনা ক্যালেন্ডার", "Publishing Calendar"],
  ["automation", "অটোমেশন নিয়ম", "Automation Rules"],
  ["analytics", "বিশ্লেষণ", "Analytics"],
  ["team", "টিম ও ভূমিকা", "Team & Roles"],
  ["integrations", "ইন্টিগ্রেশন", "Integrations"],
  ["jobs", "জব মনিটর", "Job Monitor"],
  ["audit", "অডিট লগ", "Audit Logs"],
  ["settings", "সেটিংস ও স্বাস্থ্য", "Settings & Health"],
];
const readOnlyTables: Record<string, string> = {
  jobs: "workflow_runs",
  audit: "audit_logs",
  analytics: "analytics_snapshots",
  automation: "automation_rules",
  integrations: "publication_destinations",
  social: "social_connections",
  calendar: "scheduled_publications",
  review: "content_items",
  website: "website_posts",
};
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [lang, setLang] = useState(localStorage.getItem("language") || "bn"),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "dark"),
    [page, setPage] = useState("dashboard"),
    [workspaces, setWorkspaces] = useState<Row[]>([]),
    [workspace, setWorkspace] = useState(
      localStorage.getItem("workspace") || "",
    ),
    [rows, setRows] = useState<Row[]>([]),
    [content, setContent] = useState<Row[]>([]),
    [assets, setAssets] = useState<Row[]>([]),
    [connections, setConnections] = useState<Row[]>([]),
    [selected, setSelected] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [online, setOnline] = useState(navigator.onLine),
    [menu, setMenu] = useState(false),
    [timeline, setTimeline] = useState<Row[]>([]),
    [invite, setInvite] = useState(""),
    [scheduleKey, setScheduleKey] = useState(() => crypto.randomUUID());
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const current = content.find((c) => c.id === selected);
  const refresh = () => setTick((x) => x + 1);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("language", lang);
    localStorage.setItem("theme", theme);
  }, [lang, theme]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    db.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  async function load(table: string) {
    const { data, error } = await db!
      .from(table)
      .select("*")
      .eq("workspace_id", workspace)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }
  useEffect(() => {
    if (!db || !session) return;
    db.from("workspaces")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        setWorkspaces(data || []);
        if (data?.length && !data.some((w) => w.id === workspace)) {
          setWorkspace(data[0].id);
        }
      });
  }, [session, tick]);
  useEffect(() => {
    if (!db || !workspace || !session) return;
    localStorage.setItem("workspace", workspace);
    let active = true;
    setBusy(true);
    (async () => {
      const [c, a, s] = await Promise.all([
        load("content_items"),
        load("assets"),
        load("social_connections"),
      ]);
      if (!active) return;
      setContent(c);
      setAssets(a);
      setConnections(s);
      if (selected && !c.some((x) => x.id === selected)) setSelected("");
      const table =
        readOnlyTables[page] ||
        (
          {
            sources: "source_items",
            research: "research_notes",
            scripts: "scripts",
            assets: "asset_licenses",
            video: "render_jobs",
            team: "workspace_members",
            settings: "worker_heartbeats",
            voice: "subtitle_tracks",
          } as Record<string, string>
        )[page] ||
        "audit_logs";
      let result: Row[] = [];
      if (page === "team") {
        const q = await db!
          .from(table)
          .select("*")
          .eq("workspace_id", workspace);
        if (q.error) throw q.error;
        result = q.data || [];
      } else if (page === "settings") {
        const q = await db!.from(table).select("*");
        if (q.error) throw q.error;
        result = q.data || [];
      } else result = await load(table);
      if (active) setRows(result);
      if (page === "dashboard") {
        const pairs = await Promise.all(
          [
            "content_items",
            "assets",
            "render_jobs",
            "scheduled_publications",
          ].map(async (table) => {
            const q = await db!
              .from(table)
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", workspace);
            if (q.error) throw q.error;
            return [table, q.count || 0] as const;
          }),
        );
        if (active) setCounts(Object.fromEntries(pairs));
      }
    })()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [workspace, page, session, tick]);
  useEffect(() => {
    if (!db || !workspace) return;
    const channel = db
      .channel("workspace:" + workspace)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workflow_runs",
          filter: `workspace_id=eq.${workspace}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_publications",
          filter: `workspace_id=eq.${workspace}`,
        },
        refresh,
      )
      .subscribe();
    const timer = setInterval(refresh, 30000);
    return () => {
      db!.removeChannel(channel);
      clearInterval(timer);
    };
  }, [workspace]);
  async function act(
    fn: () => Promise<unknown>,
    message = t("সংরক্ষিত", "Saved"),
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function rpc(name: string, args: Row) {
    const { data, error } = await db!.rpc(name, args);
    if (error) throw error;
    return data;
  }
  function submit(
    e: React.FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<unknown>,
    message?: string,
  ) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(() => fn(f), message);
  }
  const val = (f: FormData, k: string) => String(f.get(k) || "");
  const pick = (
    <label>
      {t("কনটেন্ট নির্বাচন", "Select content")}
      <select value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">—</option>
        {content.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} · v{c.version}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (name: string, label: string, options: Row = {}) => (
    <label>
      {label}
      <input name={name} required {...options} />
    </label>
  );
  function list() {
    return rows.length ? (
      <div className="records">
        {rows.map((r, i) => (
          <article className="record" key={r.id || r.user_id || i}>
            <header>
              <strong>
                {r.title ||
                  r.name ||
                  r.account_name ||
                  r.action ||
                  r.claim ||
                  r.id ||
                  r.user_id}
              </strong>
              <span className="badge">
                {r.status ||
                  r.decision ||
                  r.role ||
                  r.provider ||
                  r.classification ||
                  ""}
              </span>
            </header>
            {Object.entries(r)
              .filter(
                ([k]) =>
                  ![
                    "title",
                    "name",
                    "id",
                    "workspace_id",
                    "body",
                    "payload",
                    "result",
                    "metadata",
                    "details",
                    "spec",
                    "user_id",
                  ].includes(k),
              )
              .map(([k, v]) => (
                <div className="kv" key={k}>
                  <span>{k}</span>
                  <code>
                    {typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v ?? "—")}
                  </code>
                </div>
              ))}
            {["jobs", "video"].includes(page) && (
              <div className="actions">
                <button
                  onClick={() =>
                    act(
                      async () => {
                        const run =
                          page === "jobs"
                            ? r.id
                            : (
                                await db!
                                  .from("workflow_runs")
                                  .select("id")
                                  .eq("entity_id", r.id)
                                  .single()
                              ).data?.id;
                        if (!run) throw Error("Job missing");
                        const q = await db!
                          .from("workflow_steps")
                          .select("*")
                          .eq("run_id", run)
                          .order("created_at");
                        if (q.error) throw q.error;
                        setTimeline(q.data || []);
                      },
                      t("টাইমলাইন লোড হয়েছে", "Timeline loaded"),
                    )
                  }
                >
                  {t("টাইমলাইন", "Timeline")}
                </button>
                {page === "jobs" &&
                  ["queued", "running"].includes(r.status) && (
                    <button
                      onClick={() =>
                        act(() =>
                          rpc("cancel_work", { p_id: r.id, p_kind: "job" }),
                        )
                      }
                    >
                      {t("বাতিল", "Cancel")}
                    </button>
                  )}
                {page === "video" && r.artifact_path && (
                  <button
                    onClick={() =>
                      act(
                        async () => {
                          const q = await db!.storage
                            .from("video-renders")
                            .createSignedUrl(r.artifact_path, 120);
                          if (q.error) throw q.error;
                          window.open(
                            q.data.signedUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        },
                        t("প্রিভিউ লিংক তৈরি হয়েছে", "Preview link created"),
                      )
                    }
                  >
                    {t("প্রিভিউ ২ মিনিট", "Preview · 2 min")}
                  </button>
                )}
              </div>
            )}
            {page === "calendar" && r.status === "scheduled" && (
              <button
                onClick={() =>
                  act(() =>
                    rpc("cancel_work", { p_id: r.id, p_kind: "publication" }),
                  )
                }
              >
                {t("বাতিল", "Cancel")}
              </button>
            )}
            {page === "content" && (
              <button
                onClick={() => {
                  setSelected(r.id);
                  setPage("scripts");
                }}
              >
                {t("খুলুন", "Open")}
              </button>
            )}
          </article>
        ))}
      </div>
    ) : (
      <div className="empty">
        {t(
          "এখনও কোনো রেকর্ড নেই। এটি ডেমো ডেটা নয়।",
          "No records yet. No demo data is displayed.",
        )}
      </div>
    );
  }
  if (!ready)
    return (
      <main className="auth">
        <p role="status">Loading…</p>
      </main>
    );
  if (!db)
    return (
      <main className="auth">
        <h1>manager</h1>
        <h2>Not configured</h2>
        <p>
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the frontend build
          environment. No service-role key belongs here.
        </p>
      </main>
    );
  if (!session)
    return (
      <main className="auth">
        <div className="eyebrow">MULTI-TENANT PUBLISHING</div>
        <h1>
          manager<span className="accent">.</span>
        </h1>
        <p>
          {t("আপনার সম্পাদকীয় নিয়ন্ত্রণকক্ষ", "Your editorial control room")}
        </p>
        <form
          onSubmit={(e) =>
            submit(
              e,
              async (f) => {
                const mode = val(f, "mode"),
                  email = val(f, "email"),
                  password = val(f, "password");
                const result =
                  mode === "signup"
                    ? await db!.auth.signUp({
                        email,
                        password,
                        options: { emailRedirectTo: location.origin },
                      })
                    : mode === "reset"
                      ? await db!.auth.resetPasswordForEmail(email, {
                          redirectTo: location.origin,
                        })
                      : mode === "magic"
                        ? await db!.auth.signInWithOtp({
                            email,
                            options: { emailRedirectTo: location.origin },
                          })
                        : await db!.auth.signInWithPassword({
                            email,
                            password,
                          });
                if (result.error) throw result.error;
              },
              t(
                "অনুরোধ সফল। ইমেইল প্রয়োজন হলে ইনবক্স দেখুন।",
                "Request succeeded. Check your inbox if email confirmation is needed.",
              ),
            )
          }
        >
          {input("email", "Email", { type: "email", autoComplete: "email" })}
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={10}
              autoComplete="current-password"
            />
          </label>
          <label>
            {t("পদ্ধতি", "Method")}
            <select name="mode">
              <option value="signin">Sign in</option>
              <option value="signup">Create account</option>
              <option value="reset">Reset password</option>
              <option value="magic">Magic link</option>
            </select>
          </label>
          <button disabled={busy} className="primary">
            {t("চালিয়ে যান", "Continue")}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </main>
    );
  return (
    <div className="shell">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <aside className={menu ? "open" : ""}>
        <a className="logo" href="#" onClick={() => setPage("dashboard")}>
          manager<span>.</span>
        </a>
        <p className="side-label">EDITORIAL WORKSPACE</p>
        <select
          aria-label="Workspace"
          value={workspace}
          onChange={(e) => {
            setWorkspace(e.target.value);
            setSelected("");
          }}
        >
          <option value="">
            {t("ওয়ার্কস্পেস নির্বাচন", "Select workspace")}
          </option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <nav aria-label="Main">
          {nav.map(([id, bn, en]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setMenu(false);
                setTimeline([]);
              }}
            >
              <span className="nav-dot" />
              {t(bn, en)}
            </button>
          ))}
        </nav>
        <footer>
          manager / source distribution
          <br />
          Human review first
        </footer>
      </aside>
      <div className="body">
        <header className="topbar">
          <button
            className="mobile"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span className="workspace-label">
            {workspaces.find((w) => w.id === workspace)?.name ||
              "My newsroom"}
          </span>
          <span className="spacer" />
          <button onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
            {lang === "bn" ? "EN" : "বাংলা"}
          </button>
          <button
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            onClick={() =>
              act(async () => {
                const r = await db!.auth.signOut();
                if (r.error) throw r.error;
              })
            }
          >
            Sign out
          </button>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">WORKSPACE / {page.toUpperCase()}</div>
              <h1>
                {t(
                  nav.find((n) => n[0] === page)![1],
                  nav.find((n) => n[0] === page)![2],
                )}
              </h1>
            </div>
            <button disabled={busy} onClick={refresh}>
              {t("রিফ্রেশ", "Refresh")}
            </button>
          </div>
          {!online && (
            <div role="alert" className="error">
              {t(
                "অফলাইন — পরিবর্তন সংরক্ষণ করা যাবে না",
                "Offline — changes cannot be saved",
              )}
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
            </div>
          )}
          {busy && <p role="status">{t("লোড হচ্ছে…", "Loading…")}</p>}
          {!workspace && (
            <section className="panel">
              <h2>
                {t(
                  "প্রথম ওয়ার্কস্পেস তৈরি করুন",
                  "Create your first workspace",
                )}
              </h2>
              <form
                onSubmit={(e) =>
                  submit(e, async (f) => {
                    const id = await rpc("create_workspace", {
                      p_name: val(f, "name"),
                      p_slug: val(f, "slug"),
                    });
                    setWorkspace(id);
                  })
                }
              >
                {input("name", "Name", { defaultValue: "My Newsroom" })}
                {input("slug", "Slug", {
                  defaultValue: "my-newsroom",
                  pattern: "[a-z0-9][a-z0-9-]{2,60}",
                })}
                <button className="primary">Create workspace</button>
              </form>
            </section>
          )}
          {workspace && (
            <>
              {page === "dashboard" && (
                <>
                  <div className="hero">
                    <div>
                      <span className="badge">HUMAN-IN-THE-LOOP</span>
                      <h2>
                        {t(
                          "খবর থেকে প্রকাশনা,\nএকটি নির্ভরযোগ্য প্রবাহে।",
                          "From source to publication.\nOne accountable workflow.",
                        )}
                      </h2>
                      <p>
                        {t(
                          "প্রমাণ যাচাই করুন। অধিকার নিশ্চিত করুন। অনুমোদনের পরে প্রকাশ করুন।",
                          "Review evidence. Check rights. Approve before publishing.",
                        )}
                      </p>
                      <button
                        className="primary"
                        onClick={() => setPage("content")}
                      >
                        {t("নতুন কনটেন্ট", "Create content")} →
                      </button>
                    </div>
                    <div className="pipeline">
                      <span>01 · SOURCE</span>
                      <span>02 · EVIDENCE</span>
                      <span>03 · PRODUCE</span>
                      <span>04 · REVIEW → PUBLISH</span>
                    </div>
                  </div>
                  <div className="stats">
                    {Object.entries(counts).map(([k, v]) => (
                      <article key={k}>
                        <span>{k.replaceAll("_", " ")}</span>
                        <strong>
                          {v.toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
                        </strong>
                        <small>Live database count</small>
                      </article>
                    ))}
                  </div>
                  <h2>{t("সাম্প্রতিক কার্যক্রম", "Recent activity")}</h2>
                  {list()}
                </>
              )}
              {page === "content" && (
                <>
                  <section className="panel">
                    <h2>
                      {t("লেখা তৈরি ও সম্পাদনা", "Create & edit article")}
                    </h2>
                    {pick}
                    <form
                      key={current?.current_version_id || "new"}
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const id = await rpc("save_content", {
                            p_workspace: workspace,
                            p_id: current?.id || null,
                            p_version: current?.version || 0,
                            p_title: val(f, "title"),
                            p_body: val(f, "body"),
                            p_language: val(f, "language"),
                            p_sensitive: f.has("sensitive"),
                          });
                          setSelected(id);
                        })
                      }
                    >
                      {input("title", t("শিরোনাম", "Title"), {
                        defaultValue: current?.title || "",
                        maxLength: 300,
                      })}
                      <label>
                        {t("মূল লেখা (সাধারণ টেক্সট)", "Body (plain text)")}
                        <textarea
                          name="body"
                          rows={10}
                          defaultValue={current?.body || ""}
                        />
                      </label>
                      <label>
                        Language
                        <select
                          name="language"
                          defaultValue={current?.language || "bn"}
                        >
                          <option value="bn">বাংলা</option>
                          <option value="en">English</option>
                        </select>
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          name="sensitive"
                          defaultChecked={current?.sensitive ?? true}
                        />
                        {t(
                          "সংবেদনশীল বিষয় — বিস্তারিত পর্যালোচনা আবশ্যক",
                          "Sensitive subject — detailed review required",
                        )}
                      </label>
                      <button disabled={busy} className="primary">
                        {t("নতুন সংস্করণ সংরক্ষণ", "Save immutable revision")}
                      </button>
                      {current && (
                        <button type="button" onClick={() => setSelected("")}>
                          New article
                        </button>
                      )}
                    </form>
                  </section>
                  {content.map((c) => (
                    <article className="record" key={c.id}>
                      <strong>{c.title}</strong>
                      <span className="badge">
                        {c.status} · v{c.version}
                      </span>
                      <button onClick={() => setSelected(c.id)}>Edit</button>
                    </article>
                  ))}
                </>
              )}
              {page === "scripts" && (
                <section className="panel">
                  {pick}
                  <p>
                    Manual drafting works without AI. AI generation is not
                    exposed in this UI release.
                  </p>
                  {current && (
                    <form
                      onSubmit={(e) =>
                        submit(e, (f) =>
                          rpc("save_script", {
                            p_content: current.id,
                            p_version: current.version,
                            p_narration: val(f, "narration"),
                          }),
                        )
                      }
                    >
                      <label>
                        Narration
                        <textarea
                          name="narration"
                          rows={12}
                          required
                          defaultValue={current.body}
                        />
                      </label>
                      <button className="primary">Save script version</button>
                    </form>
                  )}
                  {list()}
                </section>
              )}
              {page === "assets" && (
                <>
                  <section className="panel">
                    <h2>ASSET_GUARD</h2>
                    <p>
                      {t(
                        "আপলোড করা অ্যাসেট স্বয়ংক্রিয়ভাবে অনুমোদিত নয়। প্রতিটি অ্যাসেট পর্যালোচনা করুন।",
                        "Uploads are not automatically licensed. Review every asset before use.",
                      )}
                    </p>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const file = f.get("file") as File;
                          if (!file?.size) throw Error("Choose media");
                          if (file.size > 52428800)
                            throw Error("50 MiB maximum");
                          const id = crypto.randomUUID(),
                            path = `${workspace}/${id}`;
                          const digest = Array.from(
                            new Uint8Array(
                              await crypto.subtle.digest(
                                "SHA-256",
                                await file.arrayBuffer(),
                              ),
                            ),
                          )
                            .map((n) => n.toString(16).padStart(2, "0"))
                            .join("");
                          const license = {
                            origin: "manual upload",
                            creator: val(f, "creator"),
                            license: val(f, "license"),
                            evidence_url: val(f, "evidence"),
                            retrieved_at: new Date().toISOString(),
                            attribution: val(f, "attribution"),
                            commercial: val(f, "commercial"),
                            modifications: val(f, "modifications"),
                            editorial_only: f.has("editorial"),
                            consent_notes: val(f, "consent"),
                            decision: "pending",
                            checksum: digest,
                          };
                          const up = await db!.storage
                            .from("source-assets")
                            .upload(path, file, {
                              upsert: false,
                              contentType: file.type,
                            });
                          if (up.error) throw up.error;
                          await rpc("register_asset", {
                            p_workspace: workspace,
                            p_id: id,
                            p_path: path,
                            p_mime: file.type,
                            p_size: file.size,
                            p_checksum: digest,
                            p_license: license,
                          });
                        })
                      }
                    >
                      {input("file", "Licensed media", {
                        type: "file",
                        accept:
                          "image/png,image/jpeg,image/webp,video/mp4,audio/mpeg,audio/wav",
                      })}
                      {input("creator", "Creator", { required: false })}
                      {input("license", "License identifier / terms")}
                      {input(
                        "evidence",
                        "License evidence URL / signed release reference",
                      )}
                      {input("attribution", "Required attribution", {
                        required: false,
                      })}
                      <div className="grid2">
                        <label>
                          Commercial use
                          <select name="commercial">
                            <option value="unknown">Unknown</option>
                            <option value="yes">Allowed</option>
                            <option value="no">Not allowed</option>
                          </select>
                        </label>
                        <label>
                          Modifications
                          <select name="modifications">
                            <option value="unknown">Unknown</option>
                            <option value="allowed">Allowed</option>
                            <option value="forbidden">Forbidden</option>
                          </select>
                        </label>
                      </div>
                      <label className="check">
                        <input type="checkbox" name="editorial" />
                        Editorial-only restrictions
                      </label>
                      {input("consent", "Consent / release notes", {
                        required: false,
                      })}
                      <button className="primary">
                        Upload & register pending review
                      </button>
                    </form>
                  </section>
                  {rows.map((l) => (
                    <article className="record" key={l.id}>
                      <strong>{l.asset_id}</strong>
                      <span className="badge">{l.decision}</span>
                      <pre>{JSON.stringify(l.details, null, 2)}</pre>
                      <div className="actions">
                        <button
                          onClick={() =>
                            act(() =>
                              rpc("review_asset", {
                                p_asset: l.asset_id,
                                p_decision: "approved",
                              }),
                            )
                          }
                        >
                          Approve rights
                        </button>
                        <button
                          onClick={() =>
                            act(() =>
                              rpc("review_asset", {
                                p_asset: l.asset_id,
                                p_decision: "rejected",
                              }),
                            )
                          }
                        >
                          Reject
                        </button>
                        <button
                          onClick={() =>
                            act(async () => {
                              const a = assets.find((a) => a.id === l.asset_id);
                              if (!a) throw Error("Asset not found");
                              const q = await db!.storage
                                .from(a.bucket)
                                .createSignedUrl(a.object_path, 120);
                              if (q.error) throw q.error;
                              window.open(
                                q.data.signedUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            })
                          }
                        >
                          Private preview
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
              {page === "video" && (
                <>
                  <section className="panel">
                    {pick}
                    <form
                      onSubmit={(e) =>
                        submit(
                          e,
                          (f) => {
                            if (!current) throw Error("Select content");
                            return rpc("create_render", {
                              p_content: current.id,
                              p_asset: val(f, "asset"),
                              p_audio: val(f, "audio") || null,
                              p_subtitles: val(f, "subtitles"),
                              p_ratio: val(f, "ratio"),
                              p_resolution: Number(val(f, "resolution")),
                              p_seconds: Number(val(f, "seconds")),
                            });
                          },
                          "Render queued durably; worker required.",
                        )
                      }
                    >
                      <label>
                        Image / video
                        <select name="asset" required>
                          <option value="">—</option>
                          {assets
                            .filter(
                              (a) =>
                                a.mime.startsWith("image/") ||
                                a.mime === "video/mp4",
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Uploaded narration
                        <select name="audio">
                          <option value="">
                            No narration (silent baseline)
                          </option>
                          {assets
                            .filter((a) => a.mime.startsWith("audio/"))
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.id}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="grid2">
                        <label>
                          Ratio
                          <select name="ratio">
                            <option>9:16</option>
                            <option>16:9</option>
                            <option>1:1</option>
                          </select>
                        </label>
                        <label>
                          Resolution
                          <select name="resolution">
                            <option>720</option>
                            <option>1080</option>
                          </select>
                        </label>
                      </div>
                      {input("seconds", "Explicit duration in seconds", {
                        type: "number",
                        min: 1,
                        max: 120,
                        defaultValue: 8,
                      })}
                      <label>
                        SRT captions — explicit audio-aligned/user timings only
                        <textarea
                          name="subtitles"
                          rows={5}
                          placeholder={
                            "1\n00:00:00,000 --> 00:00:03,000\nবাংলার কণ্ঠ"
                          }
                        />
                      </label>
                      <button className="primary" disabled={busy}>
                        Create CPU render job
                      </button>
                    </form>
                  </section>
                  {list()}
                  {timeline.length > 0 && (
                    <pre>{JSON.stringify(timeline, null, 2)}</pre>
                  )}
                </>
              )}
              {page === "review" && (
                <section className="panel">
                  {pick}
                  {current && (
                    <>
                      <h2>
                        {current.title} · v{current.version}
                      </h2>
                      <p className="prose">{current.body}</p>
                      <code>Version: {current.current_version_id}</code>
                      <p>
                        {current.sensitive
                          ? "Sensitive content: explicit evidence review required."
                          : "Review before approving."}
                      </p>
                      <form
                        onSubmit={(e) =>
                          submit(e, (f) =>
                            rpc("review_content", {
                              p_content: current.id,
                              p_version: current.current_version_id,
                              p_decision: val(f, "decision"),
                              p_comment: val(f, "comment"),
                            }),
                          )
                        }
                      >
                        <label>
                          Review decision
                          <select name="decision">
                            <option value="approved">Approve</option>
                            <option value="changes_requested">
                              Request changes
                            </option>
                            <option value="rejected">Reject</option>
                          </select>
                        </label>
                        <label>
                          Evidence review and comments
                          <textarea
                            name="comment"
                            minLength={current.sensitive ? 10 : 0}
                            required={current.sensitive}
                            rows={5}
                          />
                        </label>
                        <button className="primary">
                          Record review for this exact version
                        </button>
                      </form>
                    </>
                  )}
                  {list()}
                </section>
              )}
              {page === "website" && (
                <>
                  <section className="panel">
                    {pick}
                    <p>
                      Public output is static HTML, not the admin SPA.
                      Publishing queues a debounced build; deployment completion
                      is separate from editorial publication. Current release
                      publishes text-only articles.
                    </p>
                    <form
                      onSubmit={(e) =>
                        submit(
                          e,
                          (f) => {
                            if (!current) throw Error("Select content");
                            return rpc("publish_website", {
                              p_content: current.id,
                              p_slug: val(f, "slug"),
                              p_description: val(f, "description"),
                              p_category: val(f, "category"),
                              p_correction: val(f, "correction"),
                            });
                          },
                          "Approved snapshot saved; website rebuild pending.",
                        )
                      }
                    >
                      {input("slug", "Public article slug", {
                        pattern: "[a-z0-9][a-z0-9-]{0,100}",
                      })}
                      {input("description", "SEO description", {
                        maxLength: 300,
                      })}
                      {input("category", "Category slug", {
                        pattern: "[a-z0-9-]+",
                        defaultValue: "news",
                      })}
                      {input("correction", "Correction note", {
                        required: false,
                      })}
                      <button className="primary">
                        Publish approved version
                      </button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "social" && (
                <>
                  <section className="panel">
                    <h2>Mastodon</h2>
                    <p>
                      OAuth · write:statuses read:statuses read:accounts ·
                      text-only posts · scheduled by manager · official API
                      adapter implemented · not live-tested.
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        act(async () => {
                          const {
                            data: { session: s },
                          } = await db!.auth.getSession();
                          const response = await fetch(
                            `${url}/functions/v1/social-oauth/start`,
                            {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${s!.access_token}`,
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({ workspace_id: workspace }),
                            },
                          );
                          const b = await response.json();
                          if (!response.ok)
                            throw Error(b.error || "OAuth not configured");
                          location.assign(b.authorize_url);
                        }, "Redirecting to OAuth")
                      }
                    >
                      Connect with OAuth
                    </button>
                    <p>
                      Other social platforms: Not implemented. No browser-cookie
                      posting.
                    </p>
                  </section>
                  {list()}
                  {connections
                    .filter((c) => c.status === "connected")
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          act(async () => {
                            const {
                              data: { session: s },
                            } = await db!.auth.getSession();
                            const r = await fetch(
                              `${url}/functions/v1/social-oauth/disconnect`,
                              {
                                method: "POST",
                                headers: {
                                  Authorization: `Bearer ${s!.access_token}`,
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({ connection_id: c.id }),
                              },
                            );
                            if (!r.ok) throw Error((await r.json()).error);
                          })
                        }
                      >
                        Disconnect {c.account_name}
                      </button>
                    ))}
                </>
              )}
              {page === "calendar" && (
                <>
                  <section className="panel">
                    {pick}
                    <p>
                      Your timezone:{" "}
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}. Times
                      are converted to UTC on submission. Published requires
                      provider confirmation.
                    </p>
                    <form
                      onSubmit={(e) =>
                        submit(e, (f) => {
                          if (!current) throw Error("Select content");
                          return rpc("schedule_publication", {
                            p_content: current.id,
                            p_connection: val(f, "connection"),
                            p_caption: val(f, "caption"),
                            p_when: new Date(val(f, "when")).toISOString(),
                            p_key: val(f, "key"),
                          });
                        })
                      }
                    >
                      <input type="hidden" name="key" value={scheduleKey} />
                      <label>
                        Connected account
                        <select name="connection" required>
                          <option value="">
                            Not configured / select account
                          </option>
                          {connections
                            .filter((c) => c.status === "connected")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.account_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Caption
                        <textarea name="caption" maxLength={500} required />
                      </label>
                      {input("when", "Local scheduled time", {
                        type: "datetime-local",
                      })}
                      <button className="primary" disabled={busy}>
                        Schedule approved content
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleKey(crypto.randomUUID())}
                      >
                        Start a distinct schedule request
                      </button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "sources" && (
                <>
                  <section className="panel">
                    <p>
                      Manual evidence intake is implemented. Automated RSS/Atom
                      fetching and document extraction are not implemented.
                    </p>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const excerpt = val(f, "excerpt"),
                            digest = Array.from(
                              new Uint8Array(
                                await crypto.subtle.digest(
                                  "SHA-256",
                                  new TextEncoder().encode(
                                    excerpt.normalize("NFC"),
                                  ),
                                ),
                              ),
                            )
                              .map((n) => n.toString(16).padStart(2, "0"))
                              .join("");
                          const q = await db!
                            .from("source_items")
                            .insert({
                              workspace_id: workspace,
                              source_url: val(f, "url") || null,
                              source_name: val(f, "name"),
                              author: val(f, "author"),
                              excerpt,
                              user_notes: val(f, "notes"),
                              fingerprint: digest,
                            });
                          if (q.error) throw q.error;
                        })
                      }
                    >
                      {input("url", "Original source URL", {
                        type: "url",
                        required: false,
                      })}
                      {input("name", "Source name")}
                      {input("author", "Author", { required: false })}
                      <label>
                        Evidence excerpt
                        <textarea name="excerpt" required />
                      </label>
                      <label>
                        User notes
                        <textarea name="notes" />
                      </label>
                      <button className="primary">
                        Save evidence with fingerprint
                      </button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "research" && (
                <>
                  <section className="panel">
                    {pick}
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          if (!current) throw Error("Select content");
                          const q = await db!
                            .from("research_notes")
                            .insert({
                              workspace_id: workspace,
                              content_id: current.id,
                              claim: val(f, "claim"),
                              evidence_url: val(f, "evidence") || null,
                              classification: val(f, "classification"),
                              notes: val(f, "notes"),
                            });
                          if (q.error) throw q.error;
                        })
                      }
                    >
                      {input("claim", "Material claim")}
                      {input("evidence", "Evidence URL", {
                        type: "url",
                        required: false,
                      })}
                      <label>
                        Classification
                        <select name="classification">
                          {[
                            "uncertain",
                            "verified",
                            "allegation",
                            "commentary",
                            "conflicting",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Review notes
                        <textarea name="notes" />
                      </label>
                      <button className="primary">
                        Record evidence review
                      </button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "voice" && (
                <>
                  <section className="panel">
                    <p>
                      TTS / transcription: Not configured; adapters are
                      interfaces only in this release. Upload narration through
                      Asset Library. Never invent caption timing.
                    </p>
                    {pick}
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          if (!current) throw Error("Select content");
                          const text = val(f, "body");
                          parseSubtitles(text);
                          const q = await db!
                            .from("subtitle_tracks")
                            .insert({
                              workspace_id: workspace,
                              content_id: current.id,
                              format: val(f, "format"),
                              body: text,
                            });
                          if (q.error) throw q.error;
                        })
                      }
                    >
                      <label>
                        Format
                        <select name="format">
                          <option>srt</option>
                          <option>vtt</option>
                        </select>
                      </label>
                      <label>
                        Timed subtitle text
                        <textarea name="body" required rows={8} />
                      </label>
                      <button className="primary">
                        Validate & save timed subtitles
                      </button>
                    </form>
                    <form
                      onSubmit={(e) =>
                        submit(
                          e,
                          async (f) => {
                            const file = f.get("subtitle") as File;
                            const cues = parseSubtitles(await file.text());
                            const format = val(f, "format") as "srt" | "vtt";
                            const blob = new Blob([subtitles(cues, format)], {
                              type: "text/plain;charset=utf-8",
                            });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = "captions." + format;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          },
                          "Validated subtitle export created.",
                        )
                      }
                    >
                      <label>
                        Import timed SRT/VTT
                        <input
                          name="subtitle"
                          type="file"
                          accept=".srt,.vtt"
                          required
                        />
                      </label>
                      <label>
                        Export format
                        <select name="format">
                          <option>srt</option>
                          <option>vtt</option>
                        </select>
                      </label>
                      <button>Convert & download</button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "team" && (
                <>
                  <section className="panel">
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) =>
                          setInvite(
                            await rpc("invite_member", {
                              p_workspace: workspace,
                              p_email: val(f, "email"),
                              p_role: val(f, "role"),
                            }),
                          ),
                        )
                      }
                    >
                      {input("email", "Invite email", { type: "email" })}
                      <label>
                        Role
                        <select name="role">
                          {[
                            "viewer",
                            "editor",
                            "reviewer",
                            "publisher",
                            "admin",
                            "owner",
                          ].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <button>Create 48-hour invitation</button>
                    </form>
                    {invite && (
                      <p className="notice">
                        Send securely to recipient (shown only now):{" "}
                        <code>{invite}</code>
                      </p>
                    )}
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) =>
                          setWorkspace(
                            await rpc("accept_invitation", {
                              p_token: val(f, "token"),
                            }),
                          ),
                        )
                      }
                    >
                      {input("token", "Accept invitation token")}
                      <button>Accept</button>
                    </form>
                    <form
                      onSubmit={(e) =>
                        submit(e, (f) =>
                          rpc("set_member_role", {
                            p_workspace: workspace,
                            p_user: val(f, "user"),
                            p_role: val(f, "role"),
                          }),
                        )
                      }
                    >
                      {input("user", "Member user UUID")}
                      <label>
                        Role
                        <select name="role">
                          {[
                            "viewer",
                            "editor",
                            "reviewer",
                            "publisher",
                            "admin",
                            "owner",
                          ].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      <button>Change role (owner only)</button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
              {page === "settings" && (
                <>
                  <section className="panel">
                    <h2>System health</h2>
                    <p>
                      Supabase: configured · worker status: heartbeat rows below
                      · AI: operator-configured only · GPU: not provisioned.
                    </p>
                    <p>
                      Publishing pause prevents new dispatches. An already
                      submitted external request cannot be recalled.
                    </p>
                    <div className="actions">
                      <button
                        onClick={() =>
                          act(() =>
                            rpc("pause_workspace", {
                              p_workspace: workspace,
                              p_paused: true,
                            }),
                          )
                        }
                      >
                        Pause publishing
                      </button>
                      <button
                        onClick={() =>
                          act(() =>
                            rpc("pause_workspace", {
                              p_workspace: workspace,
                              p_paused: false,
                            }),
                          )
                        }
                      >
                        Resume publishing
                      </button>
                    </div>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          const q = await db!.auth.updateUser({
                            password: val(f, "password"),
                          });
                          if (q.error) throw q.error;
                        })
                      }
                    >
                      {input("password", "New password", {
                        type: "password",
                        minLength: 12,
                      })}
                      <button>Update password</button>
                    </form>
                    <h3>Additional workspace</h3>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) =>
                          setWorkspace(
                            await rpc("create_workspace", {
                              p_name: val(f, "name"),
                              p_slug: val(f, "slug"),
                            }),
                          ),
                        )
                      }
                    >
                      {input("name", "Name")}
                      {input("slug", "Slug", {
                        pattern: "[a-z0-9][a-z0-9-]{2,60}",
                      })}
                      <button>Create workspace</button>
                    </form>
                    <p>
                      Administrators: enable MFA through Supabase Auth account
                      tooling before production. MFA enrollment UI is not
                      implemented.
                    </p>
                  </section>
                  {list()}
                </>
              )}
              {page === "jobs" && (
                <>
                  {list()}
                  {timeline.length > 0 && (
                    <pre>{JSON.stringify(timeline, null, 2)}</pre>
                  )}
                  <p>
                    Polling every 30 seconds plus Supabase Realtime. Dead
                    letters and unknown outcomes require operator review; no
                    unsafe retry button.
                  </p>
                </>
              )}
              {["automation", "analytics"].includes(page) && (
                <>
                  <section className="panel">
                    <h2>
                      {page === "automation"
                        ? "Automation execution: Not implemented"
                        : "Provider analytics ingestion: Not implemented"}
                    </h2>
                    <p>
                      {page === "automation"
                        ? "Rules schema is reserved; there is no autonomous public posting. Scheduled approved publications use the durable worker."
                        : "No invented engagement, revenue, costs, or reach metrics. Snapshot rows appear only when explicitly inserted by a trusted backend."}
                    </p>
                  </section>
                  {list()}
                </>
              )}
              {page === "integrations" && (
                <>
                  <section className="panel">
                    <h2>Publication destinations</h2>
                    <p>
                      Configure this workspace's websites and social channels. New destinations start in shadow mode.
                      Registering a destination does not connect credentials or publish content.
                    </p>
                    <form onSubmit={(e) => submit(e, async (f) => {
                      let config: Row;
                      try { config = JSON.parse(val(f, "public_config") || "{}"); }
                      catch { throw Error("Public configuration must be valid JSON"); }
                      return rpc("register_publication_destination", {
                        p_workspace: workspace,
                        p_destination_type: val(f, "destination_type"),
                        p_provider_key: val(f, "provider_key"),
                        p_display_name: val(f, "display_name"),
                        p_target_key: val(f, "target_key") || null,
                        p_endpoint_url: val(f, "endpoint_url") || null,
                        p_public_config: config,
                      });
                    }, "Destination registered in shadow mode.")}>
                      <label>Destination type
                        <select name="destination_type" defaultValue="website">
                          <option value="website">Website</option>
                          <option value="social">Social channel</option>
                        </select>
                      </label>
                      <label>Provider
                        <select name="provider_key" defaultValue="manager_static">
                          <optgroup label="Websites">
                            <option value="manager_static">Manager static site</option>
                            <option value="custom_http">Custom HTTPS endpoint</option>
                            <option value="wordpress">WordPress (adapter pending)</option>
                          </optgroup>
                          <optgroup label="Social channels">
                            <option value="mastodon">Mastodon</option>
                            <option value="facebook">Facebook (adapter pending)</option>
                            <option value="instagram">Instagram (adapter pending)</option>
                            <option value="linkedin">LinkedIn (adapter pending)</option>
                            <option value="x">X (adapter pending)</option>
                            <option value="telegram">Telegram (adapter pending)</option>
                            <option value="youtube">YouTube (video adapter pending)</option>
                          </optgroup>
                        </select>
                      </label>
                      {input("display_name", "Destination name", { maxLength: 120 })}
                      {input("target_key", "Stable target key (non-secret)", { required: false, maxLength: 240 })}
                      {input("endpoint_url", "HTTPS endpoint URL (optional)", { type: "url", required: false })}
                      <label>Public configuration (JSON; never put credentials here)
                        <textarea name="public_config" rows={4} defaultValue="{}" />
                      </label>
                      <button className="primary">Register destination</button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Ownership control</h2>
                    <p>
                      Activate only after verifying the destination identity and completing a shadow comparison.
                      The current worker does not dispatch the new delivery ledger.
                    </p>
                    <form onSubmit={(e) => submit(e, (f) => rpc("set_publication_destination_ownership", {
                      p_destination: val(f, "destination_id"),
                      p_mode: val(f, "ownership_mode"),
                      p_evidence: val(f, "evidence"),
                    }), "Destination ownership updated.")}>
                      <label>Destination
                        <select name="destination_id" required>
                          {rows.map((r) => <option key={r.id} value={r.id}>{r.display_name} · {r.provider_key} · {r.ownership_mode}</option>)}
                        </select>
                      </label>
                      <label>Ownership mode
                        <select name="ownership_mode" defaultValue="shadow">
                          <option value="shadow">Shadow — no dispatch</option>
                          <option value="active">Active — reserved for Manager</option>
                          <option value="paused">Paused</option>
                        </select>
                      </label>
                      {input("evidence", "Cutover evidence (minimum 20 characters)", { minLength: 20, maxLength: 1000 })}
                      <button>Update ownership mode</button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Plan a publication delivery</h2>
                    <p>
                      Planning binds an approved immutable article version to one destination. This creates a ledger record only;
                      no provider request is sent by this release.
                    </p>
                    <form onSubmit={(e) => submit(e, (f) => {
                      const item = content.find((x) => x.id === val(f, "content_id"));
                      if (!item?.current_version_id) throw Error("Select content with a current version");
                      const when = val(f, "scheduled_at");
                      return rpc("plan_publication_delivery", {
                        p_workspace: workspace,
                        p_content: item.id,
                        p_version: item.current_version_id,
                        p_destination: val(f, "delivery_destination"),
                        p_scheduled_at: when ? new Date(when).toISOString() : new Date().toISOString(),
                      });
                    }, "Delivery intent recorded; no publication was sent.")}>
                      <label>Approved article
                        <select name="content_id" required>
                          {content.map((x) => <option key={x.id} value={x.id}>{x.title} · v{x.version}</option>)}
                        </select>
                      </label>
                      <label>Destination
                        <select name="delivery_destination" required>
                          {rows.map((r) => <option key={r.id} value={r.id}>{r.display_name} · {r.ownership_mode}</option>)}
                        </select>
                      </label>
                      <label>Schedule time (optional)
                        <input type="datetime-local" name="scheduled_at" />
                      </label>
                      <button className="primary">Plan delivery</button>
                    </form>
                  </section>
                  {list()}
                </>
              )}
            </>
          )}
        </main>
        <footer className="bottom">
          {t(
            "সম্পাদকীয় নিয়ন্ত্রণ আপনার হাতে।",
            "Editorial control stays with your team.",
          )}{" "}
          <span>manager 0.1 · incomplete source release</span>
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
