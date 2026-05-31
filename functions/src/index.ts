import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const REVIEW_BATCH_CAP = 20;
const AI_MODEL = "claude-3-5-haiku-20241022";

// Haiku 3.5 pricing (USD per token)
const INPUT_COST_PER_TOKEN = 0.25 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.25 / 1_000_000;

type ProjectId = "outpost" | "gifted" | "kv" | "homestead";
type ProposalType = "action" | "asset" | "decision" | "archive";

type AiProposal = {
  captureId: string;
  proposedType: ProposalType;
  proposedProjectId: ProjectId;
  proposedTitle: string;
  proposedSummary: string;
  proposedPriority?: "urgent" | "today" | "normal";
};

type AnthropicResponse = {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

const SYSTEM_PROMPT = `You classify captures for HomeStud OS — Bobby Woodman's personal command center.

Projects (use exact ids):
- outpost — The Outpost (men's accountability platform)
- gifted — Gifted (peer skill barter app with Michael Whitaker)
- kv — KV Properties (part-time maintenance manager role)
- homestead — Homestead (family, property, personal life)

For each capture, propose exactly one type:
- action — something Bobby should do (task, follow-up, call, fix)
- asset — valuable reference worth saving (idea, framework, research, SOP, prompt, podcast angle)
- decision — a choice Bobby made or needs to record formally
- archive — noise, duplicate, or not worth keeping

Return ONLY valid JSON (no markdown fences):
{
  "proposals": [
    {
      "captureId": "<id from input>",
      "proposedType": "action|asset|decision|archive",
      "proposedProjectId": "outpost|gifted|kv|homestead",
      "proposedTitle": "short title, max 80 chars",
      "proposedSummary": "1-3 sentence summary of what this is",
      "proposedPriority": "urgent|today|normal"
    }
  ]
}

proposedPriority is required only when proposedType is action. Be direct. Match Bobby's voice — plain, no fluff.`;

/** Callable: batch AI review for unreviewed captures. */
export const runAiReview = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const userId = request.auth.uid;
    const capturesSnap = await db
      .collection("captures")
      .where("userId", "==", userId)
      .where("reviewStatus", "==", "unreviewed")
      .orderBy("createdAt", "asc")
      .limit(REVIEW_BATCH_CAP)
      .get();

    if (capturesSnap.empty) {
      return { runId: null, processed: 0, message: "No unreviewed captures." };
    }

    const captureIds = capturesSnap.docs.map((doc) => doc.id);
    const runRef = await db.collection("reviewRuns").add({
      userId,
      status: "running",
      captureIds,
      model: AI_MODEL,
      tokenIn: 0,
      tokenOut: 0,
      estimatedCostUsd: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const apiKey = anthropicApiKey.value();
      const capturePayload = capturesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          captureId: doc.id,
          type: data.type,
          rawText: (data.rawText as string) || "",
          transcript: (data.transcript as string) || "",
        };
      });

      const { proposals, tokenIn, tokenOut } = await callAnthropicReview(apiKey, capturePayload);

      const proposalById = new Map(proposals.map((p) => [p.captureId, p]));
      const batch = db.batch();

      for (const doc of capturesSnap.docs) {
        const data = doc.data();
        const proposal =
          proposalById.get(doc.id) ??
          fallbackProposal(doc.id, (data.rawText as string) || "");

        batch.update(doc.ref, {
          reviewStatus: "proposed",
          proposedType: proposal.proposedType,
          proposedProjectId: proposal.proposedProjectId,
          proposedTitle: proposal.proposedTitle,
          proposedSummary: proposal.proposedSummary,
          ...(proposal.proposedPriority ? { proposedPriority: proposal.proposedPriority } : {}),
          aiReviewRunId: runRef.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      const estimatedCostUsd = tokenIn * INPUT_COST_PER_TOKEN + tokenOut * OUTPUT_COST_PER_TOKEN;

      await runRef.update({
        status: "completed",
        tokenIn,
        tokenOut,
        estimatedCostUsd,
        completedAt: FieldValue.serverTimestamp(),
      });

      await logAiUsage(userId, tokenIn, tokenOut, estimatedCostUsd);

      return { runId: runRef.id, processed: captureIds.length, tokenIn, tokenOut, estimatedCostUsd };
    } catch (error) {
      logger.error("runAiReview failed", error);
      await runRef.update({
        status: "failed",
        completedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "AI review failed.");
    }
  },
);

async function callAnthropicReview(
  apiKey: string,
  captures: Array<{ captureId: string; type: string; rawText: string; transcript: string }>,
): Promise<{ proposals: AiProposal[]; tokenIn: number; tokenOut: number }> {
  const userMessage = `Review these ${captures.length} captures:\n\n${JSON.stringify(captures, null, 2)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error("Anthropic API error", { status: response.status, body: errText });
    throw new Error(`Anthropic API ${response.status}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content.find((block) => block.type === "text");
  const rawText = textBlock?.text?.trim() ?? "";

  const parsed = parseProposalJson(rawText);
  const tokenIn = data.usage?.input_tokens ?? 0;
  const tokenOut = data.usage?.output_tokens ?? 0;

  return { proposals: parsed, tokenIn, tokenOut };
}

function parseProposalJson(rawText: string): AiProposal[] {
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned) as { proposals?: AiProposal[] };
  if (!Array.isArray(parsed.proposals)) {
    throw new Error("Invalid AI response: missing proposals array");
  }

  const validProjects: ProjectId[] = ["outpost", "gifted", "kv", "homestead"];
  const validTypes: ProposalType[] = ["action", "asset", "decision", "archive"];
  const validPriorities = ["urgent", "today", "normal"] as const;

  return parsed.proposals.map((p) => ({
    captureId: p.captureId,
    proposedType: validTypes.includes(p.proposedType) ? p.proposedType : "action",
    proposedProjectId: validProjects.includes(p.proposedProjectId) ? p.proposedProjectId : "outpost",
    proposedTitle: (p.proposedTitle || "Review capture").slice(0, 80),
    proposedSummary: p.proposedSummary || "",
    proposedPriority:
      p.proposedType === "action" && p.proposedPriority && validPriorities.includes(p.proposedPriority)
        ? p.proposedPriority
        : p.proposedType === "action"
          ? "today"
          : undefined,
  }));
}

function fallbackProposal(captureId: string, rawText: string): Omit<AiProposal, "captureId"> & { captureId: string } {
  return {
    captureId,
    proposedType: "action",
    proposedProjectId: "outpost",
    proposedTitle: rawText.slice(0, 80) || "Review capture",
    proposedSummary: rawText || "Captured item pending review.",
    proposedPriority: "today",
  };
}

async function logAiUsage(userId: string, tokenIn: number, tokenOut: number, costUsd: number) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const usageRef = db.collection("aiUsage").doc(`${userId}_${monthKey}`);

  await usageRef.set(
    {
      userId,
      month: monthKey,
      tokenIn: FieldValue.increment(tokenIn),
      tokenOut: FieldValue.increment(tokenOut),
      estimatedCostUsd: FieldValue.increment(costUsd),
      runCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Callable: export approved asset markdown to Storage obsidian-export path. Phase 3. */
export const exportAssetToObsidian = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const { assetId } = request.data as { assetId?: string };
  if (!assetId) {
    throw new HttpsError("invalid-argument", "assetId required.");
  }

  const userId = request.auth.uid;
  const assetRef = db.collection("assets").doc(assetId);
  const assetSnap = await assetRef.get();

  if (!assetSnap.exists || assetSnap.data()?.userId !== userId) {
    throw new HttpsError("not-found", "Asset not found.");
  }

  const asset = assetSnap.data()!;
  const projectFolder = projectVaultFolder(asset.projectId as ProjectId);
  const slug = slugify(asset.title as string);
  const obsidianPath = `${projectFolder}/Assets/${slug}.md`;
  const markdown = renderAssetMarkdown(asset);

  const storagePath = `obsidian-export/${userId}/${obsidianPath}`;
  await bucket.file(storagePath).save(markdown, {
    contentType: "text/markdown",
    metadata: { cacheControl: "no-cache" },
  });

  await assetRef.update({
    obsidianPath,
    obsidianSyncStatus: "synced",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { obsidianPath, storagePath };
});

/** Callable: export approved decision to vault export path. Phase 3. */
export const exportDecisionToObsidian = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const { decisionId } = request.data as { decisionId?: string };
  if (!decisionId) {
    throw new HttpsError("invalid-argument", "decisionId required.");
  }

  const userId = request.auth.uid;
  const decisionRef = db.collection("decisions").doc(decisionId);
  const decisionSnap = await decisionRef.get();

  if (!decisionSnap.exists || decisionSnap.data()?.userId !== userId) {
    throw new HttpsError("not-found", "Decision not found.");
  }

  const decision = decisionSnap.data()!;
  const projectFolder = projectVaultFolder(decision.projectId as ProjectId);
  const obsidianPath = `${projectFolder}/Decisions.md`;
  const entry = renderDecisionEntry(decision);

  const storagePath = `obsidian-export/${userId}/${obsidianPath}`;
  const file = bucket.file(storagePath);
  let existing = "";
  try {
    const [contents] = await file.download();
    existing = contents.toString("utf8");
  } catch {
    existing = `# Decisions — ${projectFolder}\n\n`;
  }

  await file.save(existing + entry, {
    contentType: "text/markdown",
    metadata: { cacheControl: "no-cache" },
  });

  await decisionRef.update({
    obsidianPath,
    obsidianSyncStatus: "synced",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { obsidianPath, storagePath };
});

function projectVaultFolder(projectId: ProjectId): string {
  const map: Record<ProjectId, string> = {
    outpost: "THE OUTPOST",
    gifted: "GIFTED",
    kv: "KV PROPERTIES",
    homestead: "Homestead",
  };
  return map[projectId];
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

function formatDate(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function renderAssetMarkdown(asset: FirebaseFirestore.DocumentData): string {
  return `---
type: asset
project: ${asset.projectId}
assetType: ${asset.type}
sourceCaptureId: ${asset.sourceCaptureId ?? ""}
createdAt: ${formatDate(asset.createdAt)}
---

# ${asset.title}

${asset.summary}

${asset.content}
`;
}

function renderDecisionEntry(decision: FirebaseFirestore.DocumentData): string {
  return `\n## ${decision.title} (${formatDate(decision.createdAt)})\n\n**Decision:** ${decision.decision}\n\n${decision.why ? `**Why:** ${decision.why}\n` : ""}`;
}
