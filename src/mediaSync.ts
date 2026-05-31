import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { deletePendingMedia, getPendingMedia, listPendingMedia } from "./offlineQueue";
import type { PendingMediaRecord } from "./types";

function storagePath(record: PendingMediaRecord): string {
  const folder = record.mediaKind === "voice" ? "audio.webm" : record.fileName;
  return `captures/${record.userId}/${record.captureId}/${folder}`;
}

export async function syncCaptureMedia(captureId: string): Promise<boolean> {
  const record = await getPendingMedia(captureId);
  if (!record) return false;

  const storageRef = ref(storage, storagePath(record));
  await uploadBytes(storageRef, record.blob);
  const url = await getDownloadURL(storageRef);

  const patch =
    record.mediaKind === "voice"
      ? { audioUrl: url, uploadStatus: "uploaded" as const, updatedAt: serverTimestamp() }
      : { mediaUrl: url, uploadStatus: "uploaded" as const, updatedAt: serverTimestamp() };

  await updateDoc(doc(db, "captures", captureId), patch);
  await deletePendingMedia(captureId);
  return true;
}

export async function syncAllPendingMedia(userId: string): Promise<{ synced: number; failed: number }> {
  const pending = await listPendingMedia(userId);
  let synced = 0;
  let failed = 0;

  for (const record of pending) {
    try {
      await syncCaptureMedia(record.captureId);
      synced += 1;
    } catch {
      failed += 1;
      try {
        await updateDoc(doc(db, "captures", record.captureId), {
          uploadStatus: "failed",
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Firestore may still be offline.
      }
    }
  }

  return { synced, failed };
}

export function registerMediaSync(userId: string, onSync?: (result: { synced: number; failed: number }) => void) {
  let syncing = false;

  async function runSync() {
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const result = await syncAllPendingMedia(userId);
      if (result.synced > 0 || result.failed > 0) {
        onSync?.(result);
      }
    } finally {
      syncing = false;
    }
  }

  window.addEventListener("online", runSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void runSync();
    }
  });

  void runSync();

  return () => {
    window.removeEventListener("online", runSync);
  };
}
