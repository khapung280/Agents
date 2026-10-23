import { readdir } from "node:fs/promises";
import { join } from "node:path";
export async function uninstallManifest(directory) {
  const files = [],
    directories = [];
  async function walk(relative = "") {
    for (const entry of await readdir(join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw new Error(`Symlink cannot be packaged: ${name}`);
      if (entry.isDirectory()) {
        await walk(name);
        directories.push(name);
      } else files.push(name);
    }
  }
  await walk();
  const escape = (path) =>
    path
      .replaceAll("$", () => "$$")
      .replaceAll('"', () => '$\\"')
      .replaceAll("/", "\\");
  return (
    [
      ...files.map((f) => `Delete "$INSTDIR\\${escape(f)}"`),
      ...directories.map((d) => `RMDir "$INSTDIR\\${escape(d)}"`),
    ].join("\n") + "\n"
  );
}

// Compile an explicit, build-owned extraction list. Unlike File /r, each failure
// retains the exact public package-relative item in the persistent installer log.
export async function extractionManifest(directory) {
  const lines = [];
  const escape = (value) =>
    value.replaceAll("$", () => "$$").replaceAll('"', () => '$\\"');
  async function walk(relative = "") {
    const suffix = relative.replaceAll("/", "\\");
    lines.push(
      'StrCpy $Operation "extract-directory"',
      `StrCpy $InstallItem "${escape(suffix || ".")}"`,
      "ClearErrors",
      `SetOutPath "$StageDir${suffix ? "\\" + escape(suffix) : ""}"`,
      "IfErrors stage_failed",
    );
    const entries = await readdir(join(directory, relative), {
      withFileTypes: true,
    });
    for (const entry of entries.filter((item) => !item.isDirectory())) {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new Error("Only regular package files may be extracted.");
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      if (/[\r\n]/.test(item))
        throw new Error("Package paths cannot contain newlines.");
      lines.push(
        'StrCpy $Operation "extract-file"',
        `StrCpy $InstallItem "${escape(item.replaceAll("/", "\\"))}"`,
        "ClearErrors",
        `File "${escape(join(directory, item))}"`,
        "IfErrors stage_failed",
      );
    }
    for (const entry of entries.filter((item) => item.isDirectory())) {
      if (/[\r\n]/.test(entry.name))
        throw new Error("Package paths cannot contain newlines.");
      await walk(relative ? `${relative}/${entry.name}` : entry.name);
    }
  }
  await walk();
  return lines.join("\n") + "\n";
}
