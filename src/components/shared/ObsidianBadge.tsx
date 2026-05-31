import { FileText } from "lucide-react";
import type { ObsidianSyncStatus } from "../../types";

export function ObsidianBadge({ status, path }: { status?: ObsidianSyncStatus; path?: string }) {
  if (!status || status === "pending") return null;
  if (status === "synced") {
    return (
      <span className="obsidian-badge synced" title={path ?? "Exported to Obsidian"}>
        <FileText size={12} />
        Vault
      </span>
    );
  }
  return (
    <span className="obsidian-badge failed" title="Obsidian export failed">
      Export failed
    </span>
  );
}
