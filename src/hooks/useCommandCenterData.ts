import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import {
  actionsQuery,
  assetsQuery,
  capturesQuery,
  decisionsQuery,
} from "../data";
import { registerMediaSync } from "../mediaSync";
import type { Action, Asset, Capture, Decision } from "../types";
import { convertDoc } from "../utils/convertDoc";

export function useCommandCenterData(userId: string) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubCaptures = onSnapshot(capturesQuery(userId), (snapshot) => {
      setCaptures(snapshot.docs.map((doc) => convertDoc<Capture>(doc)));
    });
    const unsubActions = onSnapshot(actionsQuery(userId), (snapshot) => {
      setActions(snapshot.docs.map((doc) => convertDoc<Action>(doc)));
    });
    const unsubAssets = onSnapshot(assetsQuery(userId), (snapshot) => {
      setAssets(snapshot.docs.map((doc) => convertDoc<Asset>(doc)));
    });
    const unsubDecisions = onSnapshot(decisionsQuery(userId), (snapshot) => {
      setDecisions(snapshot.docs.map((doc) => convertDoc<Decision>(doc)));
    });
    return () => {
      unsubCaptures();
      unsubActions();
      unsubAssets();
      unsubDecisions();
    };
  }, [userId]);

  useEffect(() => {
    return registerMediaSync(userId, ({ synced, failed }) => {
      if (synced > 0) {
        setSyncMessage(`${synced} capture${synced === 1 ? "" : "s"} synced`);
      } else if (failed > 0) {
        setSyncMessage(`${failed} upload${failed === 1 ? "" : "s"} failed — will retry`);
      }
    });
  }, [userId]);

  useEffect(() => {
    if (!syncMessage) return;
    const timer = window.setTimeout(() => setSyncMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [syncMessage]);

  const openActions = useMemo(
    () => actions.filter((action) => action.status !== "done" && action.status !== "archived"),
    [actions],
  );

  const reviewCaptures = useMemo(
    () => captures.filter((c) => c.reviewStatus === "unreviewed" || c.reviewStatus === "proposed"),
    [captures],
  );

  const unreviewedCount = useMemo(
    () => captures.filter((c) => c.reviewStatus === "unreviewed").length,
    [captures],
  );

  return {
    captures,
    actions,
    assets,
    decisions,
    openActions,
    reviewCaptures,
    unreviewedCount,
    syncMessage,
  };
}
