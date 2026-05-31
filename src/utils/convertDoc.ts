import type { QueryDocumentSnapshot } from "firebase/firestore";

export function convertDoc<T extends { id: string }>(snapshot: QueryDocumentSnapshot): T {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt?.toDate?.(),
    capturedAt: data.capturedAt?.toDate?.(),
    updatedAt: data.updatedAt?.toDate?.(),
  } as T;
}
