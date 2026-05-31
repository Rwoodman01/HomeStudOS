import { useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import {
  completeAction,
  createWaitingOnFromAction,
  projectName,
  updateActionPriority,
} from "../../data";
import type { Action, ActionPriority } from "../../types";

export function ActionItem({ action }: { action: Action }) {
  const [showWaitingInput, setShowWaitingInput] = useState(false);
  const [waitingOn, setWaitingOn] = useState(action.waitingOn ?? "");
  const [saving, setSaving] = useState(false);

  async function handlePriorityChange(priority: ActionPriority) {
    if (priority === action.priority) return;
    setSaving(true);
    try {
      await updateActionPriority(action.id, priority);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkWaiting() {
    if (!waitingOn.trim()) return;
    setSaving(true);
    try {
      await createWaitingOnFromAction(action, waitingOn.trim());
      setShowWaitingInput(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="task-item action-item">
      <button
        className="check-button"
        aria-label={`Complete ${action.title}`}
        onClick={() => completeAction(action.id)}
        disabled={saving}
      >
        <CheckCircle2 size={20} />
      </button>
      <div className="action-body">
        <strong>{action.title}</strong>
        <p>
          {projectName(action.projectId)}
          {action.status === "waiting" && action.waitingOn && (
            <span className="waiting-label"> · Waiting on {action.waitingOn}</span>
          )}
        </p>
        <div className="action-controls">
          <select
            className="action-select"
            value={action.priority}
            onChange={(e) => handlePriorityChange(e.target.value as ActionPriority)}
            disabled={saving}
            aria-label="Priority"
          >
            <option value="urgent">Urgent</option>
            <option value="today">Today</option>
            <option value="normal">Normal</option>
          </select>
          {action.status !== "waiting" && !showWaitingInput && (
            <button
              className="action-chip"
              onClick={() => setShowWaitingInput(true)}
              disabled={saving}
            >
              <Clock size={14} />
              Mark waiting
            </button>
          )}
        </div>
        {showWaitingInput && (
          <div className="waiting-form">
            <input
              type="text"
              value={waitingOn}
              onChange={(e) => setWaitingOn(e.target.value)}
              placeholder="Waiting on…"
              autoFocus
            />
            <button className="action-chip primary" onClick={handleMarkWaiting} disabled={saving || !waitingOn.trim()}>
              {saving ? <Loader2 className="spin" size={14} /> : "Save"}
            </button>
            <button className="action-chip" onClick={() => setShowWaitingInput(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
