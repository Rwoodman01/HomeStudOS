import { useState } from "react";
import { Archive, Loader2, Sparkles } from "lucide-react";
import { runAiReview } from "../../data";
import type { Capture } from "../../types";
import { ReviewCard } from "./ReviewCard";

export function ReviewPanel({
  userId,
  captures,
  unreviewedCount,
}: {
  userId: string;
  captures: Capture[];
  unreviewedCount: number;
}) {
  const [runningReview, setRunningReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  async function handleRunReview() {
    setRunningReview(true);
    setReviewMessage(null);
    try {
      const result = await runAiReview();
      if (result.processed === 0) {
        setReviewMessage(result.message ?? "Nothing to review.");
      } else {
        setReviewMessage(`AI reviewed ${result.processed} capture${result.processed === 1 ? "" : "s"}.`);
      }
    } catch {
      setReviewMessage("Review failed — try again.");
    } finally {
      setRunningReview(false);
    }
  }

  if (captures.length === 0) {
    return (
      <section className="empty-state">
        <Archive size={34} />
        <h2>Review is clear.</h2>
        <p>New captures will wait here until you approve what they become.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="review-toolbar panel">
        <div>
          <p className="eyebrow">AI Review</p>
          <p className="muted">
            {unreviewedCount > 0
              ? `${unreviewedCount} waiting for AI proposals`
              : "All captures have proposals — approve or archive below"}
          </p>
        </div>
        <button
          className="primary-button compact"
          onClick={handleRunReview}
          disabled={runningReview || unreviewedCount === 0}
        >
          {runningReview ? (
            <>
              <Loader2 className="spin" size={18} />
              <span>Running…</span>
            </>
          ) : (
            <>
              <Sparkles size={18} />
              <span>Run review</span>
            </>
          )}
        </button>
      </section>
      {reviewMessage && <div className="sync-toast">{reviewMessage}</div>}
      {captures.map((capture) => (
        <ReviewCard key={capture.id} userId={userId} capture={capture} />
      ))}
    </div>
  );
}
