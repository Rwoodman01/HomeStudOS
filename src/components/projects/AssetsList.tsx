import { ObsidianBadge } from "../shared/ObsidianBadge";
import type { Asset } from "../../types";

export function AssetsList({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) {
    return <p className="muted">No assets saved yet.</p>;
  }

  return (
    <div className="record-list">
      {assets.map((asset) => (
        <article key={asset.id} className="record-item">
          <div className="record-header">
            <strong>{asset.title}</strong>
            <ObsidianBadge status={asset.obsidianSyncStatus} path={asset.obsidianPath} />
          </div>
          <p className="record-meta">{asset.type.replace("_", " ")}</p>
          {asset.summary && <p className="record-body">{asset.summary}</p>}
        </article>
      ))}
    </div>
  );
}
