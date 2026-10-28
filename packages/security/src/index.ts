import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
export function publicIP(ip: string) {
  if (isIP(ip) === 4) return !blocked.check(ip, "ipv4");
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return /^[23]/.test(v) && !v.startsWith("2001:db8:");
  }
  return false;
}
export async function validateURL(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw Error("HTTPS public destinations only");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw Error("SSRF destination rejected");
  return u;
}
// DNS is checked on every call. Egress firewall/proxy remains required to close DNS rebinding TOCTOU.
export async function safeFetch(value: string, init: RequestInit = {}) {
  await validateURL(value);
  return fetch(value, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(30000),
  });
}
export async function limitedBytes(response: Response, max = 50 * 1024 * 1024) {
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > max)
    throw Error("Download too large");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error("Download too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function encrypt(secret: string, key: Buffer, kid: string) {
  if (key.length !== 32) throw Error("32 byte key required");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    kid,
    iv: iv.toString("base64"),
    ciphertext: body.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export function decrypt(
  v: { kid: string; iv: string; ciphertext: string; tag: string },
  key: Buffer,
) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(v.iv, "base64"));
  d.setAuthTag(Buffer.from(v.tag, "base64"));
  return Buffer.concat([
    d.update(Buffer.from(v.ciphertext, "base64")),
    d.final(),
  ]).toString("utf8");
}
export function redact(value: string) {
  return value
    .replace(/(Bearer\s+)[^\s"]+/gi, "$1[REDACTED]")
    .replace(
      /((?:token|secret|password|api_key)["']?\s*[:=]\s*["']?)[^\s",}]+/gi,
      "$1[REDACTED]",
    );
}
