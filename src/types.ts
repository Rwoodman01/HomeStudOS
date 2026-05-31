export type ProjectId = "outpost" | "gifted" | "kv" | "homestead";
export type CaptureType = "text" | "voice" | "photo" | "notebook_photo";
export type ReviewStatus = "unreviewed" | "proposed" | "approved" | "archived";
export type ProposalType = "action" | "asset" | "decision" | "archive";
export type ActionStatus = "open" | "done" | "waiting" | "archived";
export type ActionPriority = "urgent" | "today" | "normal";
export type UploadStatus = "pending_upload" | "uploaded" | "failed";
export type ObsidianSyncStatus = "pending" | "synced" | "failed";

export type Capture = {
  id: string;
  userId: string;
  type: CaptureType;
  rawText: string;
  mediaUrl?: string;
  audioUrl?: string;
  transcript?: string;
  reviewStatus: ReviewStatus;
  proposedType?: ProposalType;
  proposedProjectId?: ProjectId;
  proposedTitle?: string;
  proposedSummary?: string;
  proposedPriority?: ActionPriority;
  aiReviewRunId?: string;
  source: "mobile" | "manual";
  uploadStatus?: UploadStatus;
  offlineClientId?: string;
  createdAt?: Date;
  capturedAt?: Date;
  updatedAt?: Date;
};

export type Action = {
  id: string;
  userId: string;
  projectId: ProjectId;
  title: string;
  notes?: string;
  status: ActionStatus;
  priority: ActionPriority;
  dueDate?: string;
  waitingOn?: string;
  sourceCaptureId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type Asset = {
  id: string;
  userId: string;
  projectId: ProjectId;
  title: string;
  type: "prompt" | "research" | "framework" | "sop" | "idea" | "artifact" | "podcast_idea";
  summary: string;
  content: string;
  sourceCaptureId?: string;
  obsidianPath?: string;
  obsidianSyncStatus?: ObsidianSyncStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type Decision = {
  id: string;
  userId: string;
  projectId: ProjectId;
  title: string;
  decision: string;
  why?: string;
  sourceCaptureId?: string;
  obsidianPath?: string;
  obsidianSyncStatus?: ObsidianSyncStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type PendingMediaRecord = {
  captureId: string;
  userId: string;
  blob: Blob;
  fileName: string;
  mediaKind: "photo" | "voice";
  rawText: string;
  offlineClientId: string;
  createdAt: number;
};
