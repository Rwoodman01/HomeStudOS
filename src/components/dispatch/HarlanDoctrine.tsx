import { ShieldCheck } from "lucide-react";

export function HarlanDoctrine() {
  return (
    <section className="harlan-doctrine">
      <div className="harlan-mark" aria-hidden="true">
        <ShieldCheck size={22} />
      </div>
      <div>
        <p className="eyebrow">Harlan</p>
        <h2>Kill the Drift.</h2>
        <p>
          Nothing important gets dropped. Capture moves through Harlan into dispatch, then action.
        </p>
        <div className="harlan-rules" aria-label="Harlan operating rules">
          <span>Open loops</span>
          <span>Waiting ons</span>
          <span>Follow-ups</span>
          <span>Escalations</span>
          <span>Priorities</span>
        </div>
      </div>
    </section>
  );
}
