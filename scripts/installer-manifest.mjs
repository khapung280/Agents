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
