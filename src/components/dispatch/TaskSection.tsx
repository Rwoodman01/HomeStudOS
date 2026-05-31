import type { Action } from "../../types";
import { ActionItem } from "./ActionItem";

export function TaskSection({ title, items, empty }: { title: string; items: Action[]; empty: string }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="task-list">
          {items.map((action) => (
            <ActionItem key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}
