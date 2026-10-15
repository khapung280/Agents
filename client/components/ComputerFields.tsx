import { useState } from "react";
import {
  ComputerRequest,
  BrowserInteraction,
  type ComputerObservation,
} from "../../shared/computer";
import type { Snapshot, ToolName } from "../../shared/contracts";

export function computerFromForm(f: FormData, tool: ToolName) {
  const kind =
    tool === "computer.delegate"
      ? String(f.get("computerKind"))
      : tool === "computer.vision.prepare"
        ? "vision"
        : tool.split(".")[1];
  const observationId = String(f.get("observationId"));
  if (kind === "vision") return ComputerRequest.parse({ kind, observationId });
  if (kind === "observe" || kind === "launch")
    return ComputerRequest.parse({
      kind,
      app: String(f.get("app")),
      ...(kind === "observe" && f.get("windowId")
        ? { windowId: String(f.get("windowId")) }
        : {}),
    });
  const actionKind = String(f.get("actionKind"));
  const action = {
    kind: actionKind,
    ...(actionKind !== "focus"
      ? { elementId: String(f.get("elementId")) }
      : {}),
    ...(["setText", "typeText"].includes(actionKind)
      ? { text: String(f.get("computerText")) }
      : {}),
    ...(actionKind === "key" ? { key: String(f.get("key")) } : {}),
  };
  return ComputerRequest.parse({
    kind: "act",
    observationId,
    action,
    ...(!["focus", "move", "setText"].includes(actionKind)
      ? {
          expect: {
            elementId: String(f.get("expectElementId")),
            property: String(f.get("expectProperty")),
            equals: String(f.get("expectEquals")),
          },
        }
      : {}),
  });
}
export function browserFromForm(f: FormData) {
  const kind = String(f.get("browserKind"));
  return BrowserInteraction.parse({
    action: {
      kind,
      target: { role: f.get("browserRole"), name: f.get("browserName") },
      ...(kind === "fill" ? { text: f.get("browserText") } : {}),
      ...(kind === "press" ? { key: f.get("browserKey") } : {}),
    },
    expect: {
      target: { role: f.get("expectRole"), name: f.get("expectName") },
      property: f.get("browserProperty"),
      equals: f.get("browserEquals"),
    },
  });
}
export function ComputerFields({
  snapshot,
  tool,
}: {
  snapshot: Snapshot;
  tool: ToolName;
}) {
  const [kind, setKind] = useState(
    tool === "computer.delegate"
      ? "observe"
      : tool === "computer.vision.prepare"
        ? "vision"
        : tool.split(".")[1],
  );
  const observations = [
    ...new Map(
      snapshot.tasks
        .filter((t) => !t.workflow && t.state === "completed")
        .flatMap((t) =>
          t.output
            .filter((a) => a.name === "Windows observation" && a.content)
            .map((a) => JSON.parse(a.content!) as ComputerObservation),
        )
        .map((o) => [o.id, o]),
    ).values(),
  ];
  const [observationId, setObservationId] = useState(observations[0]?.id ?? "");
  const [action, setAction] = useState("focus");
  const observation = observations.find((o) => o.id === observationId);
  const elements =
    observation?.window.elements.filter((e) => !e.password && e.enabled) ?? [];
  const status = snapshot.capabilities.computer;
  return (
    <>
      <div className="notice">
        {status.reason} Capture includes visible application content. Review
        sensitive windows before approving. No screenshot is sent to OpenAI.
      </div>
      {tool === "computer.delegate" && (
        <label>
          Computer operation
          <select
            name="computerKind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="observe">Observe a window</option>
            <option value="launch">Launch an application</option>
            <option value="act">Act on a fresh observation</option>
            <option value="vision">Prepare offline vision review</option>
          </select>
          <small>
            Your selected agent delegates execution to the Computer Agent.
          </small>
        </label>
      )}
      {["observe", "launch"].includes(kind) ? (
        <>
          <label>
            Authorized application
            <select name="app" required defaultValue="">
              <option value="" disabled>
                Select an allowlisted application
              </option>
              {status.apps
                .filter((a) => kind !== "launch" || a.allowLaunch)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          {kind === "observe" && (
            <label>
              Window handle (optional)
              <input
                name="windowId"
                pattern="[0-9]+"
                placeholder="Required when the application has multiple windows"
              />
            </label>
          )}
        </>
      ) : (
        <>
          <label>
            Observed window
            <select
              name="observationId"
              required
              value={observationId}
              onChange={(e) => setObservationId(e.target.value)}
            >
              <option value="">Select actual captured evidence</option>
              {observations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.app} · {o.window.title} · {o.observedAt}
                </option>
              ))}
            </select>
            <small>
              Observations expire after two minutes and one input action.
              Restarting invalidates them. Project scope must match.
            </small>
          </label>
          {observation && (
            <img
              className="computer-observation"
              src={`/api/artifacts/${observation.screenshot}`}
              alt="Previously captured authorized Windows window"
            />
          )}
          {kind === "act" && (
            <>
              <label>
                Windows action
                <select
                  name="actionKind"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                >
                  {[
                    "focus",
                    "move",
                    "click",
                    "invoke",
                    "setText",
                    "typeText",
                    "key",
                  ].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              {action !== "focus" && (
                <label>
                  Observed target
                  <select name="elementId" required>
                    {elements.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.controlType} · {e.name || e.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {["setText", "typeText"].includes(action) && (
                <label>
                  Exact text
                  <input
                    name="computerText"
                    maxLength={action === "typeText" ? 500 : 2000}
                    required={action === "typeText"}
                  />
                </label>
              )}
              {action === "key" && (
                <label>
                  Key
                  <select name="key">
                    {[
                      "Tab",
                      "Escape",
                      "Enter",
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                      "Control+A",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
              )}
              {!["focus", "move", "setText"].includes(action) && (
                <>
                  <label>
                    Element to verify
                    <select name="expectElementId" required>
                      {elements.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observed property
                    <select name="expectProperty">
                      <option value="value">Value</option>
                      <option value="name">Name</option>
                      <option value="focused">Focused (true/false)</option>
                    </select>
                  </label>
                  <label>
                    Required value after the action
                    <input name="expectEquals" required maxLength={2000} />
                  </label>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
const roles = ["button", "link", "textbox", "checkbox", "combobox", "heading"];
export function BrowserFields() {
  const [kind, setKind] = useState("fill");
  return (
    <>
      <div className="notice">
        One approved action in a fresh isolated browser. Exact accessible role
        and name must identify one element. Existing accounts, downloads, and
        POST requests are unavailable.
      </div>
      <label>
        Browser action
        <select
          name="browserKind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="fill">Fill</option>
          <option value="click">Click</option>
          <option value="press">Press key</option>
        </select>
      </label>
      <label>
        Target role
        <select name="browserRole" defaultValue="textbox">
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Target accessible name
        <input name="browserName" required maxLength={200} />
      </label>
      {kind === "fill" && (
        <label>
          Exact form text
          <input name="browserText" maxLength={2000} />
        </label>
      )}
      {kind === "press" && (
        <label>
          Browser key
          <select name="browserKey">
            {["Tab", "Enter", "Escape", "ArrowDown", "ArrowUp"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Verification target role
        <select name="expectRole" defaultValue="textbox">
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Verification accessible name
        <input name="expectName" required maxLength={200} />
      </label>
      <label>
        Verification property
        <select name="browserProperty">
          <option value="value">Input value</option>
          <option value="text">Visible text</option>
          <option value="visible">Visibility (true/false)</option>
        </select>
      </label>
      <label>
        Required value after interaction
        <input name="browserEquals" required maxLength={2000} />
      </label>
    </>
  );
}
