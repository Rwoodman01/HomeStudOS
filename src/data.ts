import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "./firebase";
import { savePendingMedia } from "./offlineQueue";
import { syncCaptureMedia } from "./mediaSync";
import type {
  ActionPriority,
  ActionStatus,
  Asset,
  CaptureType,
  ProjectId,
  ProposalType,
} from "./types";

export const projects: Array<{ id: ProjectId; name: string; shortName: string }> = [
  { id: "outpost", name: "The Outpost", shortName: "Outpost" },
  { id: "gifted", name: "Gifted", shortName: "Gifted" },
  { id: "kv", name: "KV Properties", shortName: "KV" },
  { id: "homestead", name: "Homestead", shortName: "Homestead" },
];

function newOfflineClientId(): string {
  return crypto.randomUUID();
}

export function capturesQuery(userId: string) {
  return query(
    collection(db, "captures"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
}

export function actionsQuery(userId: string) {
  return query(
    collection(db, "actions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
}

export function assetsQuery(userId: string) {
  return query(
    collection(db, "assets"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
}

export function decisionsQuery(userId: string) {
  return query(
    collection(db, "decisions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
}

export function projectName(projectId: ProjectId) {
  return projects.find((project) => project.id === projectId)?.shortName ?? projectId;
}

export async function createTextCapture(userId: string, rawText: string) {
  return addDoc(collection(db, "captures"), {
    userId,
    type: "text" satisfies CaptureType,
    rawText,
    reviewStatus: "unreviewed",
    source: "mobile",
    offlineClientId: newOfflineClientId(),
    createdAt: serverTimestamp(),
    capturedAt: serverTimestamp(),
  });
}

export async function createPhotoCapture(userId: string, file: File, rawText = "") {
  const kind: CaptureType = "notebook_photo";
  const offlineClientId = newOfflineClientId();
  const captureRef = await addDoc(collection(db, "captures"), {
    userId,
    type: kind,
    rawText,
    reviewStatus: "unreviewed",
    source: "mobile",
    uploadStatus: "pending_upload",
    offlineClientId,
    createdAt: serverTimestamp(),
    capturedAt: serverTimestamp(),
  });

  await savePendingMedia({
    captureId: captureRef.id,
    userId,
    blob: file,
    fileName: file.name || "photo.jpg",
    mediaKind: "photo",
    rawText,
    offlineClientId,
    createdAt: Date.now(),
  });

  if (navigator.onLine) {
    try {
      await syncCaptureMedia(captureRef.id);
    } catch {
      // Blob stays in IndexedDB; mediaSync retries when online.
    }
  }

  return captureRef;
}

export async function createVoiceCapture(userId: string, blob: Blob, rawText = "") {
  const offlineClientId = newOfflineClientId();
  const captureRef = await addDoc(collection(db, "captures"), {
    userId,
    type: "voice" satisfies CaptureType,
    rawText,
    reviewStatus: "unreviewed",
    source: "mobile",
    uploadStatus: "pending_upload",
    offlineClientId,
    createdAt: serverTimestamp(),
    capturedAt: serverTimestamp(),
  });

  await savePendingMedia({
    captureId: captureRef.id,
    userId,
    blob,
    fileName: "audio.webm",
    mediaKind: "voice",
    rawText,
    offlineClientId,
    createdAt: Date.now(),
  });

  if (navigator.onLine) {
    try {
      await syncCaptureMedia(captureRef.id);
    } catch {
      // Retried by mediaSync.
    }
  }

  return captureRef;
}

export async function createActionFromCapture(params: {
  userId: string;
  captureId: string;
  projectId: ProjectId;
  title: string;
  notes?: string;
  priority: ActionPriority;
  status?: ActionStatus;
}) {
  await addDoc(collection(db, "actions"), {
    userId: params.userId,
    projectId: params.projectId,
    title: params.title,
    notes: params.notes ?? "",
    status: params.status ?? "open",
    priority: params.priority,
    sourceCaptureId: params.captureId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "captures", params.captureId), {
    reviewStatus: "approved",
    proposedType: "action" satisfies ProposalType,
    proposedProjectId: params.projectId,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveCapture(captureId: string) {
  await updateDoc(doc(db, "captures", captureId), {
    reviewStatus: "archived",
    proposedType: "archive" satisfies ProposalType,
    updatedAt: serverTimestamp(),
  });
}

export async function completeAction(actionId: string) {
  await updateDoc(doc(db, "actions", actionId), {
    status: "done",
    updatedAt: serverTimestamp(),
  });
}

export async function markActionWaiting(actionId: string, waitingOn: string) {
  await updateDoc(doc(db, "actions", actionId), {
    status: "waiting",
    waitingOn,
    updatedAt: serverTimestamp(),
  });
}

export async function updateActionPriority(actionId: string, priority: ActionPriority) {
  await updateDoc(doc(db, "actions", actionId), {
    priority,
    updatedAt: serverTimestamp(),
  });
}

export async function runAiReview() {
  const callable = httpsCallable<
    Record<string, never>,
    { runId: string | null; processed: number; message?: string; estimatedCostUsd?: number }
  >(functions, "runAiReview");
  const result = await callable({});
  return result.data;
}

export async function exportAssetToObsidian(assetId: string) {
  const callable = httpsCallable<{ assetId: string }, { obsidianPath: string; storagePath: string }>(
    functions,
    "exportAssetToObsidian",
  );
  const result = await callable({ assetId });
  return result.data;
}

export async function exportDecisionToObsidian(decisionId: string) {
  const callable = httpsCallable<{ decisionId: string }, { obsidianPath: string; storagePath: string }>(
    functions,
    "exportDecisionToObsidian",
  );
  const result = await callable({ decisionId });
  return result.data;
}

export async function createAssetFromCapture(params: {
  userId: string;
  captureId: string;
  projectId: ProjectId;
  title: string;
  summary: string;
  content: string;
  type?: Asset["type"];
}) {
  const assetRef = await addDoc(collection(db, "assets"), {
    userId: params.userId,
    projectId: params.projectId,
    title: params.title,
    type: params.type ?? "idea",
    summary: params.summary,
    content: params.content,
    sourceCaptureId: params.captureId,
    obsidianSyncStatus: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "captures", params.captureId), {
    reviewStatus: "approved",
    proposedType: "asset" satisfies ProposalType,
    proposedProjectId: params.projectId,
    updatedAt: serverTimestamp(),
  });
  try {
    const exported = await exportAssetToObsidian(assetRef.id);
    await updateDoc(assetRef, {
      obsidianPath: exported.obsidianPath,
      obsidianSyncStatus: "synced",
      updatedAt: serverTimestamp(),
    });
  } catch {
    await updateDoc(assetRef, {
      obsidianSyncStatus: "failed",
      updatedAt: serverTimestamp(),
    });
  }
}

export async function createDecisionFromCapture(params: {
  userId: string;
  captureId: string;
  projectId: ProjectId;
  title: string;
  decision: string;
  why?: string;
}) {
  const decisionRef = await addDoc(collection(db, "decisions"), {
    userId: params.userId,
    projectId: params.projectId,
    title: params.title,
    decision: params.decision,
    why: params.why ?? "",
    sourceCaptureId: params.captureId,
    obsidianSyncStatus: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "captures", params.captureId), {
    reviewStatus: "approved",
    proposedType: "decision" satisfies ProposalType,
    proposedProjectId: params.projectId,
    updatedAt: serverTimestamp(),
  });
  try {
    const exported = await exportDecisionToObsidian(decisionRef.id);
    await updateDoc(decisionRef, {
      obsidianPath: exported.obsidianPath,
      obsidianSyncStatus: "synced",
      updatedAt: serverTimestamp(),
    });
  } catch {
    await updateDoc(decisionRef, {
      obsidianSyncStatus: "failed",
      updatedAt: serverTimestamp(),
    });
  }
}

/** Legacy direct upload — kept for retry paths that already have a File in memory. */
export async function uploadCapturePhoto(captureId: string, userId: string, file: File) {
  const storageRef = ref(storage, `captures/${userId}/${captureId}/${file.name}`);
  await uploadBytes(storageRef, file);
  const mediaUrl = await getDownloadURL(storageRef);
  await updateDoc(doc(db, "captures", captureId), {
    mediaUrl,
    uploadStatus: "uploaded",
    updatedAt: serverTimestamp(),
  });
}
