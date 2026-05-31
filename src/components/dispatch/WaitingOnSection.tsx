import { Archive, CheckCircle2, Clock } from "lucide-react";
import { archiveWaitingOn, projectName, resolveWaitingOn } from "../../data";
import type { WaitingOn } from "../../types";

export type WaitingOnDisplayItem = WaitingOn & {
  isLegacyAction?: boolean;
  relatedWaitingOnIds?: string[];
};

export function WaitingOnSection({ items }: { items: WaitingOnDisplayItem[] }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Waiting On</h2>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted">No waiting items logged.</p>
      ) : (
        <div className="task-list">
          {items.map((item) => (
            <article key={item.id} className="task-item waiting-on-item">
              <Clock size={20} />
              <div className="action-body">
                <strong>{item.title}</strong>
                <p>
                  {projectName(item.projectId)}
                  <span className="waiting-label"> · Waiting on {item.waitingOn}</span>
                </p>
                {item.isLegacyAction ? (
                  <p className="muted">Legacy waiting action</p>
                ) : (
                  <div className="action-controls">
                    <button
                      className="action-chip primary"
                      onClick={() => resolveWaitingOn(item, item.relatedWaitingOnIds)}
                    >
                      <CheckCircle2 size={14} />
                      Resolved
                    </button>
                    <button className="action-chip" onClick={() => archiveWaitingOn(item.id)}>
                      <Archive size={14} />
                      Archive
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
