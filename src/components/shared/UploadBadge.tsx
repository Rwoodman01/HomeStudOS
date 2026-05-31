import { CloudOff } from "lucide-react";
import type { Capture } from "../../types";

export function UploadBadge({ capture }: { capture: Capture }) {
  if (capture.uploadStatus === "pending_upload") {
    return (
      <span className="upload-badge pending" title="Waiting to upload">
        <CloudOff size={14} />
      </span>
    );
  }
  if (capture.uploadStatus === "failed") {
    return (
      <span className="upload-badge failed" title="Upload failed">
        !
      </span>
    );
  }
  return null;
}
