import { existsSync } from "node:fs";
import { win32 } from "node:path";
export function browserExecutable(
  env = process.env,
  platform = process.platform,
  exists = existsSync,
): string | undefined {
  if (env.CHROMIUM_PATH) return env.CHROMIUM_PATH;
  if (platform === "win32") {
    const candidates = [
      win32.join(
        env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      win32.join(
        env.ProgramFiles || "C:\\Program Files",
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      win32.join(
        env.ProgramFiles || "C:\\Program Files",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
    ];
    return candidates.find((p) => exists(p));
  }
  return exists("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined;
}
