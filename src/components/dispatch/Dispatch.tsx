import { ClipboardList } from "lucide-react";
import type { Action, Capture, WaitingOn } from "../../types";
import { UploadBadge } from "../shared/UploadBadge";
import { AttentionBand } from "./AttentionBand";
import { HarlanDoctrine } from "./HarlanDoctrine";
import { LookingAhead } from "./LookingAhead";
import { ProjectPulse } from "./ProjectPulse";
import { TaskSection } from "./TaskSection";
import { WaitingOnSection, type WaitingOnDisplayItem } from "./WaitingOnSection";

const priorityRank: Record<Action["priority"], number> = {
  urgent: 0,
  today: 1,
  normal: 2,
};

export function Dispatch({
  actions,
  waitingOns,
  reviewCount,
  captures,
}: {
  actions: Action[];
  waitingOns: WaitingOn[];
  reviewCount: number;
  captures: Capture[];
}) {
  const activeActions = actions.filter((action) => action.status !== "waiting");
  const urgent = activeActions.filter((action) => action.priority === "urgent");
  const topFive = [...activeActions]
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 5);
  const waitingItemsByKey = new Map<string, WaitingOnDisplayItem>();
  for (const item of waitingOns) {
    const key = item.relatedActionId ? `action:${item.relatedActionId}` : `waiting-on:${item.id}`;
    const existing = waitingItemsByKey.get(key);
    if (existing) {
      existing.relatedWaitingOnIds = [...(existing.relatedWaitingOnIds ?? [existing.id]), item.id];
    } else {
      waitingItemsByKey.set(key, { ...item, relatedWaitingOnIds: [item.id] });
    }
  }
  const realWaitingItems = [...waitingItemsByKey.values()];
  const waitingActionIds = new Set(realWaitingItems.map((item) => item.relatedActionId).filter(Boolean));
  const legacyWaitingOns: WaitingOnDisplayItem[] = actions
    .filter((action) => action.status === "waiting" && !waitingActionIds.has(action.id))
    .map((action) => ({
      id: `legacy-action-${action.id}`,
      userId: action.userId,
      projectId: action.projectId,
      title: action.title,
      waitingOn: action.waitingOn ?? "unknown",
      status: "open",
      relatedActionId: action.id,
      ...(action.sourceCaptureId ? { sourceCaptureId: action.sourceCaptureId } : {}),
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      isLegacyAction: true,
    }));
  const waitingItems: WaitingOnDisplayItem[] = [...realWaitingItems, ...legacyWaitingOns];
  const recentCaptures = captures
    .filter((c) => c.reviewStatus === "unreviewed" || c.reviewStatus === "proposed")
    .slice(0, 3);

  return (
    <div className="stack">
      <HarlanDoctrine />
      <AttentionBand
        urgent={urgent.length}
        topFive={topFive.length}
        waiting={waitingItems.length}
        review={reviewCount}
      />
      <TaskSection title="Urgent" items={urgent} empty="Nothing on fire right now." />
      <TaskSection title="Top 5" items={topFive} empty="No ranked actions right now." />
      <WaitingOnSection items={waitingItems} />
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
      <LookingAhead actions={actions} />
      <ProjectPulse actions={actions} />
    </div>
  );
}
