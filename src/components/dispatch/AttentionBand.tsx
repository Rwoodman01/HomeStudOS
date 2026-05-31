import { Metric } from "../shared/Metric";

export function AttentionBand({
  urgent,
  today,
  waiting,
  review,
}: {
  urgent: number;
  today: number;
  waiting: number;
  review: number;
}) {
  return (
    <section className="attention-band">
      <Metric label="Urgent" value={urgent} />
      <Metric label="Today" value={today} />
      <Metric label="Waiting" value={waiting} />
      <Metric label="Review" value={review} />
    </section>
  );
}
