import { useState } from "react";
import {
  archiveCapture,
  createActionFromCapture,
  createAssetFromCapture,
  createDecisionFromCapture,
  projects,
  runAiReview,
} from "../../data";
import type { Capture, ProjectId, ProposalType } from "../../types";
import { UploadBadge } from "../shared/UploadBadge";

export function ReviewCard({ userId, capture }: { userId: string; capture: Capture }) {
  const hasProposal = capture.reviewStatus === "proposed";
  const [proposalType, setProposalType] = useState<ProposalType>(capture.proposedType ?? "action");
  const [projectId, setProjectId] = useState<ProjectId>(capture.proposedProjectId ?? "outpost");
  const [priority, setPriority] = useState<"urgent" | "today" | "normal">(
    capture.proposedPriority ?? "today",
  );
  const [title, setTitle] = useState(capture.proposedTitle ?? capture.rawText.slice(0, 80));
  const [summary, setSummary] = useState(capture.proposedSummary ?? capture.rawText);
  const [saving, setSaving] = useState(false);

  async function approve() {
    setSaving(true);
    try {
      if (proposalType === "action") {
        await createActionFromCapture({
          userId,
          captureId: capture.id,
          projectId,
          title: title || "Untitled action",
          notes: summary || capture.rawText,
          priority,
        });
      } else if (proposalType === "asset") {
        await createAssetFromCapture({
          userId,
          captureId: capture.id,
          projectId,
          title: title || "Untitled asset",
          summary: summary.slice(0, 280),
          content: summary || capture.rawText,
        });
      } else if (proposalType === "decision") {
        await createDecisionFromCapture({
          userId,
          captureId: capture.id,
          projectId,
          title: title || "Untitled decision",
          decision: summary || capture.rawText,
        });
      } else {
        await archiveCapture(capture.id);
      }
    } finally {
      setSaving(false);
    }
  }

  const approveLabel =
    proposalType === "action"
      ? "Approve action"
      : proposalType === "asset"
        ? "Save asset"
        : proposalType === "decision"
          ? "Log decision"
          : "Archive";

  return (
    <article className="review-card">
      {capture.mediaUrl && <img src={capture.mediaUrl} alt="Captured notebook or reference" />}
      {capture.audioUrl && <audio controls src={capture.audioUrl} className="capture-audio" />}
      <div className="capture-type">
        <span>{capture.type.replace("_", " ")}</span>
        {hasProposal && <span className="proposal-badge">AI proposed {capture.proposedType}</span>}
        <UploadBadge capture={capture} />
      </div>
      <textarea value={title} onChange={(event) => setTitle(event.target.value)} rows={2} />
      {(summary || capture.rawText) && (
        <textarea
          className="summary-field"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          placeholder="Summary"
        />
      )}
      <div className="review-controls">
        <select
          value={proposalType}
          onChange={(event) => setProposalType(event.target.value as ProposalType)}
        >
          <option value="action">Action</option>
          <option value="asset">Asset</option>
          <option value="decision">Decision</option>
          <option value="archive">Archive</option>
        </select>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value as ProjectId)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.shortName}
            </option>
          ))}
        </select>
        {proposalType === "action" && (
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as "urgent" | "today" | "normal")}
          >
            <option value="urgent">Urgent</option>
            <option value="today">Today</option>
            <option value="normal">Normal</option>
          </select>
        )}
      </div>
      <div className="review-actions">
        <button className="secondary-button" onClick={() => archiveCapture(capture.id)}>
          Archive
        </button>
        <button className="primary-button compact" onClick={approve} disabled={saving}>
          {saving ? "Saving" : approveLabel}
        </button>
      </div>
    </article>
  );
}
