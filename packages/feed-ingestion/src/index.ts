import { createHash } from "node:crypto";
import { limitedBytes, safeFetch } from "../../security/src/index.js";

export interface FeedItem {
  title: string;
  url: string;
  id: string;
  summary: string;
  author: string | null;
  publishedAt: string | null;
  fingerprint: string;
}
export interface FeedResult {
  status: "modified" | "not_modified";
  items: FeedItem[];
  etag: string | null;
  lastModified: string | null;
}
type Node = { name: string; text: string; attrs: Record<string, string>; children: Node[] };

function local(name: string) { return name.split(":").pop()!.toLowerCase(); }
function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const e = entity.toLowerCase();
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const n = e.startsWith("#x") ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
    if (!Number.isInteger(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw Error("Invalid XML character reference");
    return String.fromCodePoint(n);
  }).replace(/&[^\s;]+;/g, () => { throw Error("Unsupported XML entity"); });
}
function parseXml(xml: string): Node {
  if (xml.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error("Unsafe or oversized XML");
  const root: Node = { name: "#root", text: "", attrs: {}, children: [] };
  const stack: Node[] = [root];
  let i = 0;
  while (i < xml.length) {
    if (xml[i] !== "<") {
      const end = xml.indexOf("<", i);
      const chunk = xml.slice(i, end < 0 ? xml.length : end);
      stack[stack.length - 1].text += decode(chunk);
      i = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      if (end < 0) throw Error("Malformed XML comment");
      i = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      if (end < 0) throw Error("Malformed CDATA");
      stack[stack.length - 1].text += xml.slice(i + 9, end);
      i = end + 3; continue;
    }
    if (xml.startsWith("<?xml", i)) {
      const end = xml.indexOf("?>", i + 5);
      if (end < 0) throw Error("Malformed XML declaration");
      i = end + 2; continue;
    }
    if (xml.startsWith("<!", i) || xml.startsWith("<?", i)) throw Error("Unsupported XML declaration");
    let end = i + 1, quote = "";
    for (; end < xml.length; end++) {
      const c = xml[end];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (end >= xml.length) throw Error("Unclosed XML tag");
    let tag = xml.slice(i + 1, end).trim();
    const closing = tag.startsWith("/");
    const selfClosing = tag.endsWith("/");
    if (closing) {
      const name = tag.slice(1).trim();
      if (stack.length === 1 || stack[stack.length - 1].name !== name) throw Error("Mismatched XML closing tag");
      stack.pop();
    } else {
      tag = tag.replace(/\/$/, "").trim();
      const match = /^([A-Za-z_][\w.:-]*)\b/.exec(tag);
      if (!match) throw Error("Malformed XML element");
      const attrs: Record<string, string> = {};
      const attrText = tag.slice(match[0].length);
      const attrPattern = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      for (const a of attrText.matchAll(attrPattern)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? "");
      const node: Node = { name: match[1], text: "", attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
    i = end + 1;
  }
  if (stack.length !== 1 || root.children.length !== 1) throw Error("Incomplete or multiple-root XML");
  return root.children[0];
}
function child(node: Node, name: string): Node | undefined { return node.children.find(n => local(n.name) === name.toLowerCase()); }
function text(node: Node | undefined): string { return node ? node.text.trim() : ""; }
function descendants(node: Node, name: string): Node[] {
  return node.children.filter(n => local(n.name) === name);
}
function cleanHtml(value: string): string {
  return decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ")).trim().slice(0, 4000);
}
function atomLink(node: Node): string {
  const link = descendants(node, "link").find(n => {
    const rel = /\brel\s*=\s*["']([^"']+)/i.exec(n.name);
    return !rel || rel[1] === "alternate";
  });
  // Attribute values are extracted from the original tag by the parser's retained name only
  return text(link);
}
function isoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function parseFeed(xml: string, sourceUrl: string, maxItems = 200): FeedItem[] {
  const root = parseXml(xml), kind = local(root.name);
  let entries: Node[];
  if (kind === "rss") entries = descendants(child(root, "channel") ?? root, "item");
  else if (kind === "feed") entries = descendants(root, "entry");
  else if (kind === "rdf") entries = descendants(root, "item");
  else throw Error("Unsupported feed format");
  const source = new URL(sourceUrl);
  if (source.protocol !== "https:" || source.username || source.password) throw Error("HTTPS source URL required");
  return entries.slice(0, Math.min(Math.max(maxItems, 1), 200)).flatMap(entry => {
    const title = cleanHtml(text(child(entry, "title")));
    const linkNode = descendants(entry, "link").find(n => !n.attrs.rel || n.attrs.rel === "alternate") ?? child(entry, "link");
    const rawLink = text(linkNode) || linkNode?.attrs.href || "";
    const rawId = text(child(entry, "guid")) || text(child(entry, "id")) || rawLink;
    if (!title || !rawLink) return [];
    let url: URL;
    try { url = new URL(rawLink, source); } catch { return []; }
    if (url.protocol !== "https:" || url.username || url.password) return [];
    url.hash = "";
    const canonical = url.href;
    const summary = cleanHtml(text(child(entry, "description")) || text(child(entry, "summary")) || text(child(entry, "content")));
    const author = text(child(entry, "creator")) || text(child(entry, "author"));
    const publishedAt = isoDate(text(child(entry, "pubDate")) || text(child(entry, "published")) || text(child(entry, "updated")) || text(child(entry, "date")));
    const id = rawId.slice(0, 2000);
    const fingerprint = createHash("sha256").update(id + "\n" + canonical).digest("hex");
    return [{ title: title.slice(0, 500), url: canonical, id, summary, author: author ? author.slice(0, 300) : null, publishedAt, fingerprint }];
  });
}

export async function fetchFeed(
  sourceUrl: string,
  previous: { etag?: string | null; lastModified?: string | null } = {},
  request: typeof safeFetch = safeFetch,
): Promise<FeedResult> {
  const headers = new Headers({ Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9" });
  if (previous.etag) headers.set("If-None-Match", previous.etag);
  if (previous.lastModified) headers.set("If-Modified-Since", previous.lastModified);
  const response = await request(sourceUrl, { headers, signal: AbortSignal.timeout(15000) });
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (response.status === 304) return { status: "not_modified", items: [], etag: etag ?? previous.etag ?? null, lastModified: lastModified ?? previous.lastModified ?? null };
  if (!response.ok) throw Error(`Feed HTTP ${response.status}`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"].includes(type)) throw Error("Unsupported feed content type");
  const bytes = await limitedBytes(response, 1_000_000);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { status: "modified", items: parseFeed(xml, sourceUrl), etag, lastModified };
}
