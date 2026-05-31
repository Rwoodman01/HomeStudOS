import { Metric } from "../shared/Metric";

export function AttentionBand({
  urgent,
  topFive,
  waiting,
  review,
}: {
  urgent: number;
  topFive: number;
  waiting: number;
  review: number;
}) {
  return (
    <section className="attention-band">
      <Metric label="Urgent" value={urgent} />
      <Metric label="Top 5" value={topFive} />
      <Metric label="Waiting" value={waiting} />
      <Metric label="Review" value={review} />
    </section>
  );
}
