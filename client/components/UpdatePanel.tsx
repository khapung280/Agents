import { useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import type { DesktopUpdates, UpdateStatus } from "../desktopUpdates";

const phaseLabels: Record<UpdateStatus["phase"], string> = {
  idle: "Ready to check",
  checking: "Checking signed release metadata",
  current: "No newer verified version",
  available: "Verified update available",
  downloading: "Downloading update",
  ready: "Download verified — installation needs approval",
  awaiting_restart: "Installation pending — follow Windows prompts",
  installed: "Updated version started successfully",
  failed: "Update did not complete",
  cancelled: "Update cancelled",
  unavailable: "Windows desktop application required",
};

export function UpdatePanel() {
  const bridge = useRef<DesktopUpdates | undefined>(window.agentsUpdates);
  const [status, setStatus] = useState<UpdateStatus>({
    currentVersion: version,
    phase: bridge.current ? "idle" : "unavailable",
  });
  const [pending, setPending] = useState(false);
  const [bridgeError, setBridgeError] = useState<string>();
  const mounted = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const updates = bridge.current;
    if (!updates)
      return () => {
        mounted.current = false;
      };
    const unsubscribe = updates.onStatus((next) => {
      revision.current++;
      if (mounted.current) setStatus(next);
    });
    const initialRevision = revision.current;
    void updates
      .getStatus()
      .then((next) => {
        if (mounted.current && initialRevision === revision.current)
          setStatus(next);
      })
      .catch((error: unknown) => {
        if (mounted.current)
          setBridgeError(
            error instanceof Error
              ? error.message
              : "Desktop update status is unavailable.",
          );
      });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  async function request(method: "check" | "download" | "install" | "cancel") {
    const updates = bridge.current;
    if (!updates || (pending && method !== "cancel")) return;
    if (method !== "cancel") setPending(true);
    setBridgeError(undefined);
    const before = revision.current;
    try {
      const next = await updates[method]();
      // Main-process progress events are authoritative if an older invocation
      // resolves after a newer status was already delivered.
      if (mounted.current && before === revision.current) setStatus(next);
    } catch (error) {
      if (mounted.current)
        setBridgeError(
          error instanceof Error
            ? error.message
            : "Desktop update request failed.",
        );
    } finally {
      if (mounted.current && method !== "cancel") setPending(false);
    }
  }

  const unavailable = !bridge.current || status.phase === "unavailable";
  const busy =
    pending ||
    ["checking", "downloading", "awaiting_restart"].includes(status.phase);
  const percent =
    status.total && status.total > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.floor(((status.received ?? 0) / status.total) * 100),
          ),
        )
      : 0;
  return (
    <section aria-labelledby="application-updates-title">
      <h3 id="application-updates-title">Application updates</h3>
      <div className="setting-row">
        <span>Current application version</span>
        <strong aria-label="Current application version">
          {status.currentVersion}
        </strong>
      </div>
      <p role="status" aria-label="Update status">
        {phaseLabels[status.phase]}
      </p>
      {status.message && <p>{status.message}</p>}
      {unavailable ? (
        <p>
          Use the installed Windows desktop application to check, download and
          approve an update. This browser session cannot install software.
        </p>
      ) : (
        <>
          <p>
            Build provenance authenticates the GitHub release. The Windows
            installer remains unsigned; SmartScreen, Defender and organization
            policy stay active.
          </p>
          {status.version && (
            <div className="setting-row">
              <span>Release version</span>
              <strong>{status.version}</strong>
            </div>
          )}
          {status.phase === "downloading" && (
            <div>
              <progress
                aria-label="Update download progress"
                value={percent}
                max={100}
              />
              <p>
                {percent}% · {((status.received ?? 0) / 1048576).toFixed(1)} /{" "}
                {((status.total ?? 0) / 1048576).toFixed(1)} MiB
              </p>
            </div>
          )}
          {status.notes && (
            <details open>
              <summary>Verified release notes</summary>
              <pre aria-label="Verified release notes">{status.notes}</pre>
            </details>
          )}
          {status.sha256 && (
            <details>
              <summary>Installer SHA-256</summary>
              <pre>{status.sha256}</pre>
            </details>
          )}
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void request("check")}
            >
              Check for Updates
            </button>
            {status.phase === "available" && (
              <button
                className="secondary"
                disabled={pending}
                onClick={() => void request("download")}
              >
                Download verified update
              </button>
            )}
            {status.phase === "ready" && (
              <button
                className="secondary"
                disabled={pending}
                onClick={() => void request("install")}
              >
                Review installation
              </button>
            )}
            {["checking", "downloading"].includes(status.phase) && (
              <button
                className="secondary"
                onClick={() => void request("cancel")}
              >
                Cancel update
              </button>
            )}
          </div>
          <p>
            Installation requires a separate native confirmation. Settings,
            memories and permissions are retained; no new permissions are
            granted.
          </p>
          {status.phase === "failed" && (
            <p>
              Review the error before retrying. Your current version is
              retained. If a new version cannot start, review data compatibility
              before opening the retained previous version; no automatic
              rollback or installer replay occurs.
            </p>
          )}
        </>
      )}
      {(bridgeError || status.error) && (
        <p role="alert">{bridgeError || status.error}</p>
      )}
    </section>
  );
}
