import { CalendarDays } from "lucide-react";
import type { Action } from "../../types";
import { projectName } from "../../data";

export function LookingAhead({ actions }: { actions: Action[] }) {
  const datedActions = actions
    .filter((action) => action.status !== "done" && action.status !== "archived" && action.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Looking Ahead</h2>
        <span>{datedActions.length}</span>
      </div>
      {datedActions.length === 0 ? (
        <p className="muted">No dated open loops on the board.</p>
      ) : (
        <div className="mini-list">
          {datedActions.map((action) => (
            <article key={action.id} className="mini-item">
              <CalendarDays size={18} />
              <span>
                <strong>{action.dueDate}</strong> · {projectName(action.projectId)} · {action.title}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
