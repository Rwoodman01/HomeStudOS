import { ClipboardList } from "lucide-react";
import type { Action, Capture } from "../../types";
import { UploadBadge } from "../shared/UploadBadge";
import { AttentionBand } from "./AttentionBand";
import { ProjectPulse } from "./ProjectPulse";
import { TaskSection } from "./TaskSection";

export function Dispatch({
  actions,
  reviewCount,
  captures,
}: {
  actions: Action[];
  reviewCount: number;
  captures: Capture[];
}) {
  const urgent = actions.filter((action) => action.priority === "urgent" && action.status !== "waiting");
  const today = actions.filter(
    (action) => action.priority === "today" && action.status !== "waiting",
  );
  const waiting = actions.filter((action) => action.status === "waiting");
  const recentCaptures = captures
    .filter((c) => c.reviewStatus === "unreviewed" || c.reviewStatus === "proposed")
    .slice(0, 3);

  return (
    <div className="stack">
      <AttentionBand
        urgent={urgent.length}
        today={today.length}
        waiting={waiting.length}
        review={reviewCount}
      />
      <TaskSection title="Urgent" items={urgent} empty="Nothing on fire right now." />
      <TaskSection title="Today" items={today} empty="No today tasks yet." />
      <TaskSection title="Waiting On" items={waiting} empty="No waiting items logged." />
      <section className="panel">
        <div className="section-heading">
          <h2>Captures To Review</h2>
          <span>{reviewCount}</span>
        </div>
        {recentCaptures.length === 0 ? (
          <p className="muted">Nothing in review queue.</p>
        ) : (
          <div className="mini-list">
            {recentCaptures.map((capture) => (
              <article key={capture.id} className="mini-item">
                <ClipboardList size={18} />
                <span>{capture.rawText || capture.type.replace("_", " ")}</span>
                <UploadBadge capture={capture} />
              </article>
            ))}
          </div>
        )}
      </section>
      <ProjectPulse actions={actions} />
    </div>
  );
}
