import { Plus } from "lucide-react";

import { api } from "../../api";

import type { ModuleContext } from "../Modules";
export function ProjectsModule({
  s,
  handle,
}: Pick<ModuleContext, "s" | "handle">) {
  return (
    <>
      <form
        className="form inset"
        onSubmit={(e) =>
          handle(e, (f) =>
            api("/projects", "POST", {
              name: f.get("name"),
              objective: f.get("objective"),
              repository: f.get("repository"),
            }),
          )
        }
      >
        <h3>Create a project</h3>
        <div className="form-grid">
          <label>
            Name
            <input name="name" required placeholder="My next project" />
          </label>
          <label>
            Repository reference
            <input
              name="repository"
              placeholder="Optional repository URL (reference only)"
            />
          </label>
        </div>
        <label>
          Objective
          <textarea
            name="objective"
            required
            rows={2}
            placeholder="Define a measurable outcome…"
          />
        </label>
        <button className="primary">
          <Plus size={16} />
          Create project
        </button>
      </form>
      <div className="project-grid">
        {s.projects.map((p) => (
          <article className="project-card" key={p.id}>
            <span className="eyebrow">PROJECT / {p.id.slice(0, 6)}</span>
            <h3>{p.name}</h3>
            <p>{p.objective}</p>
            {p.repository && <code>{p.repository}</code>}
            <div className="milestones">
              {p.milestones.map((m, i) => (
                <span key={i}>
                  <i>{i + 1}</i>
                  {m}
                </span>
              ))}
            </div>
            <form
              className="inline-form"
              onSubmit={(e) =>
                handle(e, (f) =>
                  api(`/projects/${p.id}`, "PATCH", {
                    milestones: [...p.milestones, String(f.get("milestone"))],
                  }),
                )
              }
            >
              <input name="milestone" placeholder="Add a milestone" required />
              <button
                className="icon-button"
                aria-label={`Add milestone to ${p.name}`}
              >
                <Plus size={17} />
              </button>
            </form>
            <small>
              {
                s.tasks.filter((t) => t.workflow && t.input.projectId === p.id)
                  .length
              }{" "}
              linked workflows
            </small>
          </article>
        ))}
      </div>
    </>
  );
}
