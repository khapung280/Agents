import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

// These deterministic controller fixtures replace signature verification,
// Internet-zone marking and ShellExecute. They do not establish cryptographic
// provenance, Windows installation, SmartScreen behavior or desktop control.
// The production verifier is tested separately in update-trust.test.ts.
type Manifest = {
  schema: number;
  version: string;
  sourceCommit: string;
  generatedAt: string;
  notes: string;
  channel: string;
  minUpdaterProtocol: number;
  dataSchema: number;
  installer: { name: string; size: number; sha256: string };
};
type Status = {
  currentVersion: string;
  phase: string;
  version?: string;
  notes?: string;
  received?: number;
  total?: number;
  error?: string;
  message?: string;
};
type VerificationOptions = { currentVersion: string; highestVersion?: string };
type Options = {
  directory: string;
  currentVersion: string;
  platform?: string;
  transport?: (url: string, options: RequestInit) => Promise<Response>;
  verify?: (
    manifest: Buffer,
    bundle: Buffer,
    options: VerificationOptions,
  ) => Manifest | Promise<Manifest>;
  markDownload?: (path: string, version: string) => Promise<void>;
  timeoutMs?: number;
};
type Confirm = (manifest: Manifest, signal: AbortSignal) => Promise<boolean>;
type Launch = (
  path: string,
  signal: AbortSignal,
  dispatched: () => void,
) => Promise<string>;
type Controller = {
  status(): Status;
  initialize(): Promise<Status>;
  check(): Promise<Status>;
  download(): Promise<Status>;
  cancel(): Status;
  install(confirm: Confirm, launch: Launch): Promise<Status>;
  on(event: "status", callback: (status: Status) => void): void;
};
const { Updater, permittedUrl } = createRequire(import.meta.url)(
  "../desktop/updater.cjs",
) as {
  Updater: new (options: Options) => Controller;
  permittedUrl: (url: string) => URL;
};
const installerName = "Ultimate-Agents-Both-Setup.exe";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const compare = (a: string, b: string) => {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return 0;
};
async function until(check: () => boolean) {
  const end = Date.now() + 3000;
  while (!check() && Date.now() < end) await delay(5);
  assert.ok(check(), "fixture condition completed within three seconds");
}
async function fixture(
  changes: Partial<Options> = {},
  releaseVersion = "0.3.0",
) {
  const root = await mkdtemp(join(tmpdir(), "agents-update-fixture-"));
  const directory = join(root, "updates");
  const payload = Buffer.from("MZ isolated installer fixture; never executed");
  const manifest: Manifest = {
    schema: 1,
    version: releaseVersion,
    sourceCommit: "a".repeat(40),
    generatedAt: new Date().toISOString(),
    notes: "Controller fixture release notes, not a published release.",
    channel: "stable",
    minUpdaterProtocol: 1,
    dataSchema: 1,
    installer: {
      name: installerName,
      size: payload.length,
      sha256: hash(payload),
    },
  };
  const requested: string[] = [];
  const verified: VerificationOptions[] = [];
  const marked: string[] = [];
  let mode = "normal";
  const transport = async (url: string, options: RequestInit) => {
    requested.push(url);
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    assert.equal(new Headers(options.headers).has("authorization"), false);
    if (url.includes("/releases/latest"))
      return Response.json({
        draft: false,
        prerelease: false,
        tag_name: "v" + manifest.version,
      });
    if (url.endsWith("/agents-update.json"))
      return new Response(
        mode === "metadata-oversize"
          ? "x".repeat(40000)
          : JSON.stringify(manifest),
      );
    if (url.endsWith("/agents-update.sigstore.json"))
      return new Response('{"controllerFixture":true}');
    assert.ok(
      url.endsWith("/" + installerName),
      "Only fixed asset names are requested",
    );
    if (mode === "connection") throw new Error("Fixture connection failed");
    if (mode === "http")
      return new Response("Fixture unavailable", { status: 503 });
    if (mode === "redirect")
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.invalid/installer.exe" },
      });
    if (mode === "length")
      return new Response(new Uint8Array(payload), {
        headers: { "content-length": "99999" },
      });
    if (mode === "interrupted")
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(payload.subarray(0, 5)));
            setTimeout(
              () => controller.error(new Error("Fixture interrupted")),
              5,
            );
          },
        }),
      );
    if (mode === "waiting") {
      const signal = options.signal as AbortSignal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(payload.subarray(0, 5)));
            signal.addEventListener(
              "abort",
              () => controller.error(signal.reason),
              {
                once: true,
              },
            );
          },
        }),
      );
    }
    const returned =
      mode === "corrupt"
        ? Buffer.from(payload.toString().replace("isolated", "Isolated"))
        : mode === "partial"
          ? payload.subarray(0, 12)
          : mode === "oversized"
            ? Buffer.concat([payload, Buffer.from("extra")])
            : payload;
    return new Response(new Uint8Array(returned));
  };
  const verify = (
    bytes: Buffer,
    bundle: Buffer,
    options: VerificationOptions,
  ) => {
    assert.equal(bundle.toString(), '{"controllerFixture":true}');
    verified.push(structuredClone(options));
    const value = JSON.parse(bytes.toString()) as Manifest;
    if (
      compare(value.version, options.currentVersion) < 0 ||
      (options.highestVersion &&
        compare(value.version, options.highestVersion) < 0)
    )
      throw new Error("Fixture verifier rejected a downgrade.");
    return value;
  };
  const options: Options = {
    directory,
    currentVersion: "0.2.0",
    platform: "win32",
    transport,
    verify,
    markDownload: async (path) => {
      marked.push(path);
    },
    ...changes,
  };
  const updater = new Updater(options);
  return {
    root,
    directory,
    payload,
    manifest,
    requested,
    verified,
    marked,
    options,
    updater,
    mode: (value: string) => {
      mode = value;
    },
    restart: (currentVersion = options.currentVersion) =>
      new Updater({ ...options, currentVersion }),
    async installer() {
      const dirs = await readdir(directory, { withFileTypes: true });
      const folder = dirs.find(
        (d) => d.isDirectory() && d.name.startsWith("download-"),
      );
      assert.ok(folder, "A download directory exists");
      return join(directory, folder.name, installerName);
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("updater fixtures verify metadata before download and retain accepted version across restart", async () => {
  const f = await fixture();
  try {
    const sentinel = join(f.root, "permissions.json");
    await writeFile(sentinel, '{"computer":false,"model":false}');
    const status = await f.updater.check();
    assert.equal(status.phase, "available");
    assert.equal(status.version, "0.3.0");
    assert.equal(status.notes, f.manifest.notes);
    assert.equal(f.requested.length, 3);
    assert.equal(f.verified.length, 1);
    assert.equal(
      f.requested.some((url) => url.endsWith(".exe")),
      false,
    );
    const history = JSON.parse(
      await readFile(join(f.directory, "state.json"), "utf8"),
    );
    assert.equal(history.highestVersion, "0.3.0");
    assert.match(history.manifestHash, /^[a-f0-9]{64}$/);
    assert.equal((await f.updater.download()).phase, "ready");
    assert.deepEqual(await readFile(await f.installer()), f.payload);
    assert.equal(f.marked.length, 0, "Download is not installation approval");
    const restarted = f.restart();
    await restarted.initialize();
    assert.equal((await restarted.check()).phase, "available");
    assert.equal(f.verified.at(-1)?.highestVersion, "0.3.0");
    assert.equal(
      await readFile(sentinel, "utf8"),
      '{"computer":false,"model":false}',
    );
  } finally {
    await f.cleanup();
  }
});

test("current release does not permit download or installation; non-Windows makes no requests", async () => {
  const f = await fixture({}, "0.2.0");
  const nonWindows = await fixture({ platform: "linux" });
  try {
    assert.equal((await f.updater.check()).phase, "current");
    assert.equal((await f.updater.download()).phase, "failed");
    let launches = 0;
    await f.updater.install(
      async () => true,
      async () => {
        launches++;
        return "";
      },
    );
    assert.equal(launches, 0);
    assert.equal(
      f.requested.some((url) => url.endsWith(".exe")),
      false,
    );
    assert.equal((await nonWindows.updater.check()).phase, "unavailable");
    assert.equal((await nonWindows.updater.download()).phase, "unavailable");
    assert.deepEqual(nonWindows.requested, []);
  } finally {
    await f.cleanup();
    await nonWindows.cleanup();
  }
});

test("changed accepted manifest, verifier rejection and downgrade remain blocked", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    f.manifest.notes = "Changed notes for the same version";
    assert.match((await f.updater.check()).error || "", /manifest changed/i);
    assert.equal((await f.updater.download()).phase, "failed");
    f.manifest.version = "0.2.1";
    assert.match((await f.restart().check()).error || "", /downgrade/i);
    assert.equal(
      f.requested.some((url) => url.endsWith(".exe")),
      false,
    );
  } finally {
    await f.cleanup();
  }
  const invalid = await fixture({
    verify: () => {
      throw new Error("Fixture invalid signature");
    },
  });
  try {
    assert.match(
      (await invalid.updater.check()).error || "",
      /invalid signature/,
    );
    assert.equal((await invalid.updater.download()).phase, "failed");
    assert.equal(
      invalid.requested.some((url) => url.endsWith(".exe")),
      false,
    );
  } finally {
    await invalid.cleanup();
  }
});

test("updater rejects malformed history and oversized metadata without replacing user data", async () => {
  const f = await fixture();
  try {
    await mkdir(f.directory, { recursive: true });
    await writeFile(
      join(f.directory, "state.json"),
      '{"highestVersion":["0.3.0"]}',
    );
    assert.equal((await f.updater.check()).phase, "failed");
    assert.equal(f.requested.length, 0);
    assert.equal(
      await readFile(join(f.directory, "state.json"), "utf8"),
      '{"highestVersion":["0.3.0"]}',
    );
  } finally {
    await f.cleanup();
  }
  const large = await fixture();
  try {
    large.mode("metadata-oversize");
    const status = await large.updater.check();
    assert.equal(status.phase, "failed");
    assert.match(status.error || "", /size limit/);
    assert.equal(large.verified.length, 0);
  } finally {
    await large.cleanup();
  }
});

test("updater URL policy rejects credentials, non-HTTPS, unrelated hosts and ports", () => {
  for (const url of [
    "http://github.com/khapung280/Agents",
    "file:///tmp/installer.exe",
    "https://github.com.attacker.invalid/installer.exe",
    "https://attacker.invalid/installer.exe",
    "https://user:secret@github.com/installer.exe",
    "https://github.com:444/installer.exe",
    "https://127.0.0.1/installer.exe",
  ])
    assert.throws(() => permittedUrl(url));
  assert.equal(
    permittedUrl("https://github.com/khapung280/Agents").hostname,
    "github.com",
  );
});

test("failed, corrupted, partial and oversized downloads never leave an executable ready", async (t) => {
  for (const mode of [
    "connection",
    "http",
    "redirect",
    "length",
    "interrupted",
    "corrupt",
    "partial",
    "oversized",
  ])
    await t.test(mode, async () => {
      const f = await fixture();
      try {
        await f.updater.check();
        f.mode(mode);
        const status = await f.updater.download();
        assert.equal(status.phase, "failed");
        assert.ok(status.error);
        assert.equal(f.marked.length, 0);
        const entries = await readdir(f.directory);
        assert.equal(
          entries.some((name) => name.startsWith("download-")),
          false,
        );
        assert.equal(
          f.requested.some((url) => url.includes("attacker.invalid")),
          false,
        );
        let launches = 0;
        await f.updater.install(
          async () => true,
          async () => {
            launches++;
            return "";
          },
        );
        assert.equal(launches, 0);
      } finally {
        await f.cleanup();
      }
    });
});

test("download cancellation settles, removes partial bytes and suppresses duplicate operations", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    f.mode("waiting");
    const pending = f.updater.download();
    await until(() => (f.updater.status().received ?? 0) > 0);
    const requests = f.requested.length;
    assert.equal((await f.updater.download()).phase, "downloading");
    assert.equal((await f.updater.check()).phase, "downloading");
    assert.equal(f.requested.length, requests);
    f.updater.cancel();
    assert.equal((await pending).phase, "cancelled");
    assert.equal(
      (await readdir(f.directory)).some((name) => name.startsWith("download-")),
      false,
    );
    assert.equal(f.marked.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("download deadline settles a stalled stream and retains the existing application", async () => {
  const f = await fixture({ timeoutMs: 1000 });
  try {
    await f.updater.check();
    f.mode("waiting");
    const start = Date.now();
    const status = await f.updater.download();
    assert.equal(status.phase, "failed");
    assert.ok(Date.now() - start < 3000);
    assert.match(status.error || "", /timeout|aborted/i);
    assert.equal(f.marked.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("installation requires native approval and detects installer tampering before handoff", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    await f.updater.download();
    let launches = 0;
    const launch: Launch = async () => {
      launches++;
      return "";
    };
    assert.equal(
      (await f.updater.install(async () => false, launch)).phase,
      "ready",
    );
    assert.equal(launches, 0);
    assert.equal(f.marked.length, 0);
    const path = await f.installer();
    const status = await f.updater.install(async () => {
      await writeFile(path, "tampered after native dialog opened");
      return true;
    }, launch);
    assert.equal(status.phase, "failed");
    assert.match(status.error || "", /changed after download/);
    assert.equal(launches, 0);
    assert.equal(f.marked.length, 0);
  } finally {
    await f.cleanup();
  }
});

test("approved handoff marks the download, remains pending and cannot execute twice", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    await f.updater.download();
    let launches = 0;
    const launch: Launch = async (path, signal, dispatched) => {
      signal.throwIfAborted();
      assert.deepEqual(f.marked, [path]);
      dispatched();
      launches++;
      return "";
    };
    const status = await f.updater.install(async () => true, launch);
    assert.equal(status.phase, "awaiting_restart");
    assert.equal(launches, 1);
    await f.updater.install(async () => true, launch);
    await f.updater.check();
    await f.updater.download();
    assert.equal(launches, 1);
    const history = JSON.parse(
      await readFile(join(f.directory, "state.json"), "utf8"),
    );
    assert.equal(history.pendingVersion, "0.3.0");
    const oldVersion = f.restart();
    const pending = await oldVersion.initialize();
    assert.equal(pending.phase, "failed");
    assert.match(pending.message || "", /not.*active|not.*become/i);
    assert.equal(launches, 1, "Restart never invokes the Windows shell");
    assert.equal(
      (await oldVersion.install(async () => true, launch)).phase,
      "failed",
    );
    assert.equal(launches, 1);
  } finally {
    await f.cleanup();
  }
});

test("expected new version acknowledges startup without replaying installation", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    await f.updater.download();
    await f.updater.install(
      async () => true,
      async (_path, _signal, dispatched) => {
        dispatched();
        return "";
      },
    );
    const next = f.restart("0.3.0");
    assert.equal((await next.initialize()).phase, "installed");
    assert.equal(
      JSON.parse(await readFile(join(f.directory, "state.json"), "utf8"))
        .pendingVersion,
      undefined,
    );
    assert.equal((await next.download()).phase, "failed");
  } finally {
    await f.cleanup();
  }
});

test("Internet-zone failure and failed shell handoff never report installation success", async (t) => {
  await t.test("zone marking fails closed before shell execution", async () => {
    const f = await fixture({
      markDownload: async () => {
        throw new Error("Fixture ADS unavailable");
      },
    });
    try {
      await f.updater.check();
      await f.updater.download();
      let launches = 0;
      const status = await f.updater.install(
        async () => true,
        async () => {
          launches++;
          return "";
        },
      );
      assert.equal(status.phase, "failed");
      assert.match(status.error || "", /ADS unavailable/);
      assert.equal(launches, 0);
    } finally {
      await f.cleanup();
    }
  });
  await t.test("failed shell outcome is not replayed", async () => {
    const f = await fixture();
    try {
      await f.updater.check();
      await f.updater.download();
      let launches = 0;
      const launch: Launch = async (_path, _signal, dispatched) => {
        dispatched();
        launches++;
        return "Fixture Windows block";
      };
      const status = await f.updater.install(async () => true, launch);
      assert.equal(status.phase, "failed");
      assert.match(status.error || "", /Windows block/);
      await f.updater.install(async () => true, launch);
      assert.equal(launches, 1);
      assert.doesNotMatch(status.message || "", /No installer was started/);
    } finally {
      await f.cleanup();
    }
  });
});

test("cancellation or deadline while native approval is open settles without marking or launch", async (t) => {
  for (const cancel of [true, false])
    await t.test(cancel ? "cancel" : "deadline", async () => {
      const f = await fixture({ timeoutMs: 1000 });
      try {
        await f.updater.check();
        await f.updater.download();
        let dialogOpen = false;
        let approved: ((value: boolean) => void) | undefined;
        let launches = 0;
        const pending = f.updater.install(
          async () => {
            dialogOpen = true;
            return new Promise<boolean>((resolve) => {
              approved = resolve;
            });
          },
          async () => {
            launches++;
            return "";
          },
        );
        await until(() => dialogOpen);
        if (cancel) f.updater.cancel();
        const status = await pending;
        assert.equal(status.phase, cancel ? "cancelled" : "failed");
        approved?.(true);
        await delay(10);
        assert.equal(launches, 0);
        assert.equal(f.marked.length, 0);
      } finally {
        await f.cleanup();
      }
    });
});

test("cancellation during worker shutdown prevents the later shell dispatch", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    await f.updater.download();
    let shutdownEntered = false;
    let finishShutdown: (() => void) | undefined;
    let launches = 0;
    const pending = f.updater.install(
      async () => true,
      async (_path, signal, dispatched) => {
        shutdownEntered = true;
        await new Promise<void>((resolve) => {
          finishShutdown = resolve;
        });
        signal.throwIfAborted();
        dispatched();
        launches++;
        return "";
      },
    );
    await until(() => shutdownEntered);
    f.updater.cancel();
    assert.equal((await pending).phase, "cancelled");
    finishShutdown?.();
    await delay(10);
    assert.equal(launches, 0);
    await f.updater.install(
      async () => true,
      async () => {
        launches++;
        return "";
      },
    );
    assert.equal(
      launches,
      0,
      "An uncertain handoff is not retried in this process",
    );
  } finally {
    await f.cleanup();
  }
});

test("cancellation after dispatch reports uncertainty and cannot claim nothing opened", async () => {
  const f = await fixture();
  try {
    await f.updater.check();
    await f.updater.download();
    let launched = false;
    let finishShell: ((value: string) => void) | undefined;
    const pending = f.updater.install(
      async () => true,
      async (_path, _signal, dispatched) => {
        dispatched();
        launched = true;
        return new Promise<string>((resolve) => {
          finishShell = resolve;
        });
      },
    );
    await until(() => launched);
    f.updater.cancel();
    const status = await pending;
    assert.equal(status.phase, "failed");
    assert.match(status.message || "", /uncertain/);
    assert.doesNotMatch(status.message || "", /No installer was started/);
    finishShell?.("");
    await delay(10);
    assert.equal(f.updater.status().phase, "failed");
  } finally {
    await f.cleanup();
  }
});

test("startup removes only recognized partial downloads and preserves completed/unrelated files", async () => {
  const f = await fixture();
  try {
    const owned = join(f.directory, "download-Ab12cd");
    const unrelated = join(f.directory, "personal");
    await mkdir(owned, { recursive: true });
    await mkdir(unrelated);
    await writeFile(join(owned, installerName + ".part"), "incomplete fixture");
    await writeFile(join(owned, installerName), f.payload);
    await writeFile(join(unrelated, installerName + ".part"), "owner file");
    await f.updater.initialize();
    assert.deepEqual(await readdir(owned), [installerName]);
    assert.deepEqual(await readFile(join(owned, installerName)), f.payload);
    assert.equal(
      await readFile(join(unrelated, installerName + ".part"), "utf8"),
      "owner file",
    );
    assert.equal(f.requested.length, 0);
  } finally {
    await f.cleanup();
  }
});
