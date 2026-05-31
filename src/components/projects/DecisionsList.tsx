import { ObsidianBadge } from "../shared/ObsidianBadge";
import type { Decision } from "../../types";

export function DecisionsList({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return <p className="muted">No decisions logged yet.</p>;
  }

  return (
    <div className="record-list">
      {decisions.map((decision) => (
        <article key={decision.id} className="record-item">
          <div className="record-header">
            <strong>{decision.title}</strong>
            <ObsidianBadge status={decision.obsidianSyncStatus} path={decision.obsidianPath} />
          </div>
          <p className="record-body">{decision.decision}</p>
          {decision.why && <p className="record-meta">Why: {decision.why}</p>}
        </article>
      ))}
    </div>
  );
}
