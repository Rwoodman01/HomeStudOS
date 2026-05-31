import { projects } from "../../data";
import type { Action } from "../../types";
import { Metric } from "../shared/Metric";

export function ProjectPulse({ actions }: { actions: Action[] }) {
  const pulse = projects.map((project) => ({
    ...project,
    openCount: actions.filter((a) => a.projectId === project.id).length,
  }));

  return (
    <section className="panel project-pulse">
      <div className="section-heading">
        <h2>Project Pulse</h2>
      </div>
      <div className="pulse-grid">
        {pulse.map((project) => (
          <div key={project.id} className="pulse-item">
            <strong>{project.shortName}</strong>
            <Metric label="Open" value={project.openCount} />
          </div>
        ))}
      </div>
    </section>
  );
}
