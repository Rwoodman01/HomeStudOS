import { CalendarDays, FileText, Mail, Mic, NotebookTabs } from "lucide-react";
import type { Capture } from "../../types";

function sourceLabel(capture: Capture) {
  if (capture.source === "gmail") return "Gmail";
  if (capture.source === "calendar") return "Calendar";
  if (capture.type === "voice") return "Voice";
  if (capture.type === "notebook_photo" || capture.type === "photo") return "Photo";
  return "Text";
}

function SourceIcon({ capture }: { capture: Capture }) {
  if (capture.source === "gmail") return <Mail size={18} />;
  if (capture.source === "calendar") return <CalendarDays size={18} />;
  if (capture.type === "voice") return <Mic size={18} />;
  if (capture.type === "notebook_photo" || capture.type === "photo") return <NotebookTabs size={18} />;
  return <FileText size={18} />;
}

export function CaptureSourceSummary({ capture }: { capture: Capture }) {
  if (capture.source === "gmail") {
    return (
      <section className="source-summary">
        <div className="source-icon">
          <SourceIcon capture={capture} />
        </div>
        <div>
          <span className="source-badge">Gmail</span>
          <h3>{capture.gmailSubject || "Gmail thread"}</h3>
          <p>{capture.gmailFrom || "Unknown sender"}</p>
          <p>{capture.gmailDate || "No date"}</p>
          {capture.gmailSnippet && <p className="source-snippet">{capture.gmailSnippet}</p>}
        </div>
      </section>
    );
  }

  if (capture.source === "calendar") {
    return (
      <section className="source-summary">
        <div className="source-icon">
          <SourceIcon capture={capture} />
        </div>
        <div>
          <span className="source-badge">Calendar</span>
          <h3>{capture.calendarTitle || "Calendar event"}</h3>
          <p>
            {capture.eventStart || "Unknown start"}
            {capture.eventEnd ? ` to ${capture.eventEnd}` : ""}
          </p>
          {capture.calendarLocation && <p>{capture.calendarLocation}</p>}
        </div>
      </section>
    );
  }

  return (
    <div className="capture-type">
      <span className="source-badge">
        <SourceIcon capture={capture} />
        {sourceLabel(capture)}
      </span>
    </div>
  );
}
