import {
  addDoc,
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "./firebase";
import { savePendingMedia } from "./offlineQueue";
import { syncCaptureMedia } from "./mediaSync";
import type {
  Action,
  ActionPriority,
  ActionStatus,
  Asset,
  CaptureType,
  IntegrationConnection,
  IntegrationId,
  ProjectId,
  ProposalType,
  UserSettings,
  WaitingOn,
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

export function waitingOnsQuery(userId: string) {
  return query(
    collection(db, "waitingOns"),
    where("userId", "==", userId),
    where("status", "==", "open"),
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

export function integrationRef(userId: string, integrationId: IntegrationId) {
  return doc(db, "users", userId, "integrations", integrationId);
}

export function userSettingsRef(userId: string) {
  return doc(db, "users", userId, "settings", "harlan");
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

export async function getIntegrationConnection(
  userId: string,
  integrationId: IntegrationId,
): Promise<IntegrationConnection | null> {
  const snap = await getDoc(integrationRef(userId, integrationId));
  if (!snap.exists()) return null;
  return { id: integrationId, ...snap.data() } as IntegrationConnection;
}

export async function connectGoogleIntegration(params: {
  user: User;
  integrationId: IntegrationId;
  scopes: string[];
}) {
  const callable = httpsCallable<
    { integrationId: IntegrationId; scopes: string[] },
    { url: string }
  >(functions, "getGoogleOAuthUrl");
  const result = await callable({
    integrationId: params.integrationId,
    scopes: params.scopes,
  });
  window.location.assign(result.data.url);
}

export async function runGoogleDebriefNow() {
  const callable = httpsCallable<Record<string, never>, { imported: number }>(
    functions,
    "runGoogleDebriefNow",
  );
  const result = await callable({});
  return result.data;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const snap = await getDoc(userSettingsRef(userId));
  if (!snap.exists()) {
    return {
      userId,
      debriefTime: "20:30",
      timezone: "America/Halifax",
    };
  }
  return { userId, ...snap.data() } as UserSettings;
}

export async function updateDebriefTime(userId: string, debriefTime: string) {
  await setDoc(
    userSettingsRef(userId),
    {
      userId,
      debriefTime,
      timezone: "America/Halifax",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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

export async function createWaitingOnFromAction(action: Action, waitingOn: string) {
  const batch = writeBatch(db);
  const waitingOnRef = doc(db, "waitingOns", action.id);

  batch.set(waitingOnRef, {
    userId: action.userId,
    projectId: action.projectId,
    title: action.title,
    waitingOn,
    status: "open",
    relatedActionId: action.id,
    ...(action.sourceCaptureId ? { sourceCaptureId: action.sourceCaptureId } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  batch.update(doc(db, "actions", action.id), {
    status: "waiting",
    waitingOn,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function resolveWaitingOn(waitingOn: WaitingOn, relatedWaitingOnIds: string[] = []) {
  await runTransaction(db, async (transaction) => {
    const waitingOnRef = doc(db, "waitingOns", waitingOn.id);
    const relatedWaitingOnRefs = relatedWaitingOnIds
      .filter((id) => id !== waitingOn.id)
      .map((id) => doc(db, "waitingOns", id));
    const actionRef = waitingOn.relatedActionId
      ? doc(db, "actions", waitingOn.relatedActionId)
      : null;
    const actionSnap = actionRef ? await transaction.get(actionRef) : null;

    transaction.update(waitingOnRef, {
      status: "resolved",
      updatedAt: serverTimestamp(),
    });
    for (const relatedWaitingOnRef of relatedWaitingOnRefs) {
      transaction.update(relatedWaitingOnRef, {
        status: "resolved",
        updatedAt: serverTimestamp(),
      });
    }

    if (!actionRef || !actionSnap?.exists()) return;

    const status = actionSnap.data().status;
    if (status !== "done" && status !== "archived") {
      transaction.update(actionRef, {
        status: "open",
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export async function archiveWaitingOn(waitingOnId: string) {
  await updateDoc(doc(db, "waitingOns", waitingOnId), {
    status: "archived",
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
