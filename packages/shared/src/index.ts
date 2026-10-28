import { z } from "zod";
export const ScriptSchema = z
  .object({
    title: z.string().min(1),
    hook: z.string(),
    narration: z.string().min(1),
    scene_plan: z.array(
      z.object({
        asset_id: z.string().uuid().optional(),
        description: z.string(),
      }),
    ),
    on_screen_captions: z.array(z.string()),
    evidence_references: z.array(z.string().url()),
    editorial_warnings: z.array(z.string()),
    social_caption: z.string(),
    hashtags: z.array(z.string()),
  })
  .strict();
export type Script = z.infer<typeof ScriptSchema>;
export const LicenseSchema = z.object({
  origin: z.string().min(1),
  original_url: z.string().url().optional(),
  creator: z.string(),
  license: z.string().min(1),
  evidence_url: z.string().min(1),
  retrieved_at: z.string().datetime(),
  attribution: z.string(),
  commercial: z.enum(["yes", "no", "unknown"]),
  modifications: z.enum(["allowed", "forbidden", "unknown"]),
  editorial_only: z.boolean(),
  consent_notes: z.string(),
  decision: z.enum(["pending", "approved", "rejected"]),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
export type License = z.infer<typeof LicenseSchema>;
export function assetGuard(l: License) {
  LicenseSchema.parse(l);
  if (
    l.decision !== "approved" ||
    l.commercial !== "yes" ||
    l.modifications !== "allowed" ||
    l.editorial_only
  )
    throw new Error("ASSET_GUARD: rights pending or incompatible");
  return l;
}
export const transitions = {
  render: {
    queued: ["running", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
  publication: {
    draft: ["scheduled", "cancelled"],
    scheduled: ["dispatching", "cancelled"],
    dispatching: ["published", "failed", "unknown"],
    unknown: ["published", "cancelled"],
    published: [],
    failed: [],
    cancelled: [],
  },
} as const;
export function canTransition(
  kind: keyof typeof transitions,
  from: string,
  to: string,
) {
  return (
    (transitions[kind] as Record<string, readonly string[]>)[from] ?? []
  ).includes(to);
}
export function retryDelay(attempt: number, random = Math.random) {
  return (
    Math.min(3600, 2 ** Math.min(attempt, 10) * 5) + Math.floor(random() * 10)
  );
}
export function normalizeBengali(
  s: string,
  dictionary: Record<string, string> = {},
) {
  let t = s.normalize("NFC").replace(/\r\n/g, "\n");
  for (const [k, v] of Object.entries(dictionary)) t = t.split(k).join(v);
  return t;
}
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export type Cue = { start: number; end: number; text: string };
export function parseSubtitles(s: string): Cue[] {
  return s
    .replace(/^WEBVTT[^\n]*\n/, "")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((b) => {
      const lines = b.split("\n");
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) throw Error("Subtitle timing required");
      const time = (v: string) => {
        const m = v.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
        if (!m || +m[2] > 59 || +m[3] > 59) throw Error("Invalid timing");
        return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      };
      const [a, c] = lines[i].split("-->");
      const start = time(a),
        end = time(c);
      if (end <= start) throw Error("Invalid timing range");
      return { start, end, text: lines.slice(i + 1).join("\n") };
    });
}
export function subtitles(cues: Cue[], format: "srt" | "vtt") {
  const t = (v: number) => {
    const ms = Math.round(v * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${format === "srt" ? "," : "."}${String(ms % 1000).padStart(3, "0")}`;
  };
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    cues
      .map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}`)
      .join("\n\n") +
    "\n"
  );
}
