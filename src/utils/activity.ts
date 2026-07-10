// src/utils/activity.ts
// Lightweight append-only activity log. Every write is best-effort — logging
// must never block or fail the underlying inventory action.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/utils/firebase";
import type { Role } from "@/utils/permissions";

export type ActivityAction = "add" | "edit" | "delete" | "import";

export interface ActivityActor {
  uid: string | null;
  role: Role | null;
}

export interface ActivityEntry {
  action: ActivityAction;
  /** Human-readable subject, e.g. the product name. */
  item: string;
  category?: string;
  /** Optional detail, e.g. "front 3 → 5" or "12 products". */
  detail?: string;
}

export async function logActivity(
  entry: ActivityEntry,
  actor: ActivityActor
): Promise<void> {
  try {
    await addDoc(collection(db, "activityLog"), {
      action: entry.action,
      item: entry.item,
      category: entry.category ?? null,
      detail: entry.detail ?? null,
      actorUid: actor.uid ?? null,
      actorRole: actor.role ?? null,
      at: serverTimestamp(),
    });
  } catch {
    /* swallow — logging is non-critical */
  }
}
