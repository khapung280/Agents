import { Trash2, Search, Save } from "lucide-react";

import { api } from "../../api";
import { Badge } from "../Primitives";
import type { ModuleContext } from "../Modules";
export function KnowledgeModule({
  s,
  act,
  query,
  setQuery,
  editing,
  setEditing,
  scope,
  setScope,
  handle,
}: Pick<
  ModuleContext,
  | "s"
  | "act"
  | "query"
  | "setQuery"
  | "editing"
  | "setEditing"
  | "scope"
  | "setScope"
  | "handle"
>) {
  return (
    <>
      <div className="section-lead">
        <p>Reviewed knowledge. Scoped to the project you choose.</p>
        <Badge state="local" />
      </div>
      <form
        className="form inset"
        key={editing?.id ?? "new"}
        onSubmit={(e) =>
          handle(e, async (f) => {
            await api(
              editing ? `/memories/${editing.id}` : "/memories",
              editing ? "PATCH" : "POST",
              {
                scope: f.get("scope"),
                category: f.get("category"),
                title: f.get("title"),
                content: f.get("content"),
              },
            );
            setEditing(null);
          })
        }
      >
        <h3>{editing ? "Correct memory" : "Add a memory"}</h3>
        <div className="form-grid">
          <label>
            Title
            <input
              name="title"
              defaultValue={editing?.title}
              required
              placeholder="A useful preference or decision"
            />
          </label>
          <label>
            Scope
            <select name="scope" defaultValue={editing?.scope ?? scope}>
              <option value="personal">Personal</option>
              {s.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Category
          <select
            name="category"
            defaultValue={editing?.category ?? "preference"}
          >
            {[
              "preference",
              "project",
              "document",
              "business",
              "decision",
              "workflow",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Content
          <textarea
            aria-label="Content"
            name="content"
            defaultValue={editing?.content}
            required
            rows={3}
            placeholder="Only save information you want agents to retrieve in this scope."
          />
        </label>
        <div className="button-row">
          <button className="primary">
            <Save size={16} />
            {editing ? "Save correction" : "Save memory"}
          </button>
          {editing && (
            <button
              type="button"
              className="secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="filter-row">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search memories"
            placeholder="Search this scope…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter memory scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="personal">Personal</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {s.memories
        .filter(
          (m) =>
            m.scope === scope &&
            `${m.title} ${m.content}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .map((m) => (
          <article className="memory-card" key={m.id}>
            <div>
              <span className="eyebrow">{m.category}</span>
              <h3>{m.title}</h3>
              <p>{m.content}</p>
            </div>
            <div className="button-row">
              <button className="text-button" onClick={() => setEditing(m)}>
                Edit
              </button>
              <button
                className="icon-button"
                aria-label={`Delete memory ${m.title}`}
                onClick={() => act(() => api(`/memories/${m.id}`, "DELETE"))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
    </>
  );
}
