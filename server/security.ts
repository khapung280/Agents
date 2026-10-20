import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolve, sep } from "node:path";
import { lstat, realpath } from "node:fs/promises";

export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 6) return false; // IPv6 is denied until the complete reserved-range policy is implemented.
  const n = ip.split(".").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isInteger(v) || v < 0 || v > 255))
    return false;
  const [a, b] = n;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export async function allowedUrl(raw: string, hosts: string[]): Promise<URL> {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !hosts.includes(u.hostname) ||
    isIP(u.hostname)
  )
    throw new Error(
      "Only configured public HTTPS hosts are permitted. Add the exact host in environment configuration.",
    );
  const ips = await lookup(u.hostname, { all: true, family: 4 });
  if (!ips.length || ips.some((r) => !publicAddress(r.address)))
    throw new Error("Private or reserved network destinations are blocked.");
  return u;
}
export async function scopedPath(root: string, name: string): Promise<string> {
  if (
    !name ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/")
  )
    throw new Error("A relative workspace path is required.");
  const base = await realpath(root),
    target = resolve(base, name);
  if (!target.startsWith(base + sep))
    throw new Error("Path escapes the authorized workspace.");
  const parts = name.split("/");
  if (
    [...name].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    /[:*?"<>|]/.test(name) ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw new Error(
      "Workspace path contains an unsafe or nonportable filename.",
    );
  if (
    parts.some(
      (part) =>
        /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.npmrc|\.netrc|\.pypirc|credentials(?:[._-].*)?|client_secret.*|service[-_]account.*)$/i.test(
          part,
        ) || /\.(?:pem|key|p12|pfx|kdbx)$/i.test(part),
    )
  )
    throw new Error(
      "Sensitive credential/configuration paths are not accessible to workspace tools.",
    );
  let current = target;
  while (current !== base) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Symbolic links are not permitted in workspace paths.");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    current = resolve(current, "..");
  }
  return target;
}
export function redact(text: string): string {
  return text
    .replace(
      /(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|(?:api[_-]?key|password|token)\s*[:=]\s*["']?[^\s"',;]+)/gi,
      "[redacted]",
    )
    .slice(0, 50000);
}
