import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { projects } from "../../data";
import type { Action, Asset, Capture, Decision } from "../../types";
import { Metric } from "../shared/Metric";
import { AssetsList } from "./AssetsList";
import { DecisionsList } from "./DecisionsList";

export function ProjectsPanel({
  actions,
  assets,
  decisions,
  captures,
}: {
  actions: Action[];
  assets: Asset[];
  decisions: Decision[];
  captures: Capture[];
}) {
  const grouped = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        actions: actions.filter((action) => action.projectId === project.id),
        assets: assets.filter((asset) => asset.projectId === project.id),
        decisions: decisions.filter((decision) => decision.projectId === project.id),
        captures: captures.filter((capture) => capture.proposedProjectId === project.id),
      })),
    [actions, assets, decisions, captures],
  );

  return (
    <div className="stack">
      {grouped.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectCard({
  project,
}: {
  project: {
    id: string;
    name: string;
    shortName: string;
    actions: Action[];
    assets: Asset[];
    decisions: Decision[];
    captures: Capture[];
  };
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="project-card project-card-expanded">
      <button className="project-card-toggle" onClick={() => setExpanded(!expanded)}>
        <div>
          <p className="eyebrow">Project</p>
          <h2>{project.name}</h2>
        </div>
        <div className="project-toggle-right">
          <div className="project-stats">
            <Metric label="Actions" value={project.actions.length} />
            <Metric label="Assets" value={project.assets.length} />
            <Metric label="Decisions" value={project.decisions.length} />
          </div>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </button>

      {expanded && (
        <div className="project-sections">
          <div className="project-section">
            <h3>Assets</h3>
            <AssetsList assets={project.assets} />
          </div>
          <div className="project-section">
            <h3>Decisions</h3>
            <DecisionsList decisions={project.decisions} />
          </div>
        </div>
      )}
    </section>
  );
}
