import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall } from "firebase-functions/v2/https";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";

if (!getApps().length) {
  initializeApp();
}

function db() {
  return getFirestore();
}

function bucket() {
  return getStorage().bucket();
}

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const googleOAuthClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const googleOAuthClientId = defineString("GOOGLE_OAUTH_CLIENT_ID");
const appBaseUrl = defineString("APP_BASE_URL", { default: "https://homestud-os.web.app" });

const REVIEW_BATCH_CAP = 20;
const AI_MODEL = "claude-3-5-haiku-20241022";
const GOOGLE_REDIRECT_PATH = "/googleOAuthCallback";

// Haiku 3.5 pricing (USD per token)
const INPUT_COST_PER_TOKEN = 0.25 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 1.25 / 1_000_000;

type ProjectId = "outpost" | "gifted" | "kv" | "homestead";
type ProposalType = "action" | "asset" | "decision" | "archive";
type IntegrationId = "gmail" | "calendar";

const GOOGLE_SCOPE_PREFIX = "https://www.googleapis.com/auth/";

const INTEGRATION_SCOPES: Record<IntegrationId, string[]> = {
  gmail: [
    `${GOOGLE_SCOPE_PREFIX}gmail.readonly`,
    `${GOOGLE_SCOPE_PREFIX}gmail.compose`,
  ],
  calendar: [`${GOOGLE_SCOPE_PREFIX}calendar.events.readonly`],
};

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

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GmailThreadListResponse = {
  threads?: Array<{ id: string; historyId?: string }>;
};

type GmailThreadResponse = {
  id: string;
  messages?: Array<{
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: {
      headers?: Array<{ name: string; value: string }>;
    };
  }>;
};

type CalendarEventsResponse = {
  items?: Array<{
    id?: string;
    htmlLink?: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    updated?: string;
  }>;
};

const SYSTEM_PROMPT = `You are Harlan, the continuity layer for HomeStud OS.

Mission: Kill the Drift.
Core promise: nothing important gets dropped.

Role:
- Remember commitments, open loops, waiting-ons, follow-ups, captures, escalations, and priorities so Bobby does not have to carry everything in his head.
- Keep the flow clean: Capture → Harlan → Dispatch → Action.
- Own dispatch generation: Urgent, Top 5, Waiting On, Captures to Review, Looking Ahead.
- Make sure every important item eventually ends as Completed, Deferred, Delegated, Archived, or Abandoned intentionally. No silent disappearing.

Boundaries:
- Do not send emails automatically.
- Do not replace Claude for writing.
- Do not replace Gemini for research.
- Do not create autonomous agent chaos.

System principle:
- Use logic first.
- Use AI only where judgment is needed.
- 1926 discipline. 2026 tools.

Operational memory lives in Firebase: actions, captures, waitingOns, projects, assets, decisions.
Knowledge memory lives in Obsidian: research, frameworks, lessons, prompts, decisions, book notes, useful AI outputs.

You classify captures for Bobby Woodman's personal command center.

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

proposedPriority is required only when proposedType is action.

Classification rules:
- If it creates a commitment, follow-up, escalation, repair, call, errand, or visible next move, classify it as action.
- If Bobby is waiting on another person or outside condition, classify it as action and make the waiting-on clear in the title or summary.
- If it is durable knowledge worth finding again, classify it as asset for Obsidian.
- If it records a choice, tradeoff, or policy, classify it as decision for Obsidian.
- If it is noise, duplicate, or intentionally not worth keeping, classify it as archive.
- Gmail captures where Bobby owes a reply, follow-up, answer, quote, payment, decision, or confirmation should become actions.
- Gmail captures where someone else owes Bobby a reply, payment, decision, delivery, quote, or update should become actions with the waiting-on person named clearly.
- Calendar captures that require prep, travel, a follow-up, a reminder, or a decision should become actions.
- Calendar captures that are only context and require no next move should be archived unless they record durable knowledge.

Voice: direct, calm, plain. No fluff. No motivational copy. Preserve continuity and say what is what.`;

const STREAM_MODEL = "claude-sonnet-4-6";

/** HTTP: stream a Claude response back to the new PWA dashboard. */
export const claudeStream = onRequest(
  { secrets: [anthropicApiKey], timeoutSeconds: 120, cors: false },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      response.status(401).send("Unauthorized");
      return;
    }

    try {
      // Lazy-load auth to avoid module-level import hang
      const { getAuth } = await import("firebase-admin/auth");
      await getAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      response.status(401).send("Invalid token");
      return;
    }

    const { prompt } = request.body as { prompt?: string };
    if (!prompt || typeof prompt !== "string") {
      response.status(400).send("prompt required");
      return;
    }

    const apiKey = anthropicApiKey.value();

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: STREAM_MODEL,
          max_tokens: 4096,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      logger.error("Anthropic fetch failed", err);
      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      logger.error("Anthropic non-OK", { status: upstreamResponse.status });
      response.write("data: [DONE]\n\n");
      response.end();
      return;
    }

    const reader  = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            response.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
          }
        } catch {
          // skip malformed SSE events
        }
      }
    }

    response.write("data: [DONE]\n\n");
    response.end();
  },
);

export const getGoogleOAuthUrl = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const { integrationId } = request.data as { integrationId?: IntegrationId };

  if (!integrationId || !["gmail", "calendar"].includes(integrationId)) {
    throw new HttpsError("invalid-argument", "Valid integrationId required.");
  }

  const scopes = INTEGRATION_SCOPES[integrationId];

  const stateRef = db().collection("oauthStates").doc();
  await stateRef.set({
    userId: request.auth.uid,
    integrationId,
    scopes,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleOAuthClientId.value());
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", stateRef.id);

  return { url: url.toString() };
});

export const googleOAuthCallback = onRequest(
  { secrets: [googleOAuthClientSecret] },
  async (request, response) => {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";

    if (!code || !state) {
      response.status(400).send("Missing OAuth code or state.");
      return;
    }

    const stateRef = db().collection("oauthStates").doc(state);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      response.status(400).send("Invalid OAuth state.");
      return;
    }

    const stateData = stateSnap.data() as {
      userId: string;
      integrationId: IntegrationId;
      scopes: string[];
      status: string;
    };

    if (stateData.status !== "pending") {
      response.status(400).send("OAuth state already used.");
      return;
    }

    try {
      const token = await exchangeGoogleCode(code);
      if (!token.access_token) {
        throw new Error(token.error_description || token.error || "Missing access token");
      }

      const existingTokenRef = db().collection("googleOAuthTokens").doc(stateData.userId);
      const existingTokenSnap = await existingTokenRef.get();
      const existingScopes = Array.isArray(existingTokenSnap.data()?.scopes)
        ? (existingTokenSnap.data()?.scopes as string[])
        : [];
      const scopes = Array.from(new Set([...existingScopes, ...stateData.scopes]));

      await existingTokenRef.set(
        {
          userId: stateData.userId,
          ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
          scopes,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const email = await fetchGoogleUserEmail(token.access_token);

      await db()
        .collection("users")
        .doc(stateData.userId)
        .collection("integrations")
        .doc(stateData.integrationId)
        .set(
          {
            userId: stateData.userId,
            status: "connected",
            scopes,
            email,
            connectedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            errorMessage: FieldValue.delete(),
          },
          { merge: true },
        );

      await stateRef.update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
      });

      response.redirect(`${appBaseUrl.value()}?settings=integrations&connected=${stateData.integrationId}`);
    } catch (error) {
      logger.error("Google OAuth callback failed", error);
      await stateRef.update({
        status: "failed",
        completedAt: FieldValue.serverTimestamp(),
      });
      await db()
        .collection("users")
        .doc(stateData.userId)
        .collection("integrations")
        .doc(stateData.integrationId)
        .set(
          {
            userId: stateData.userId,
            status: "error",
            scopes: stateData.scopes,
            errorMessage: "Connection failed. Try again.",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      response.redirect(
        `${appBaseUrl.value()}?settings=integrations&connected=failed&integration=${stateData.integrationId}`,
      );
    }
  },
);

export const syncGoogleIntegrations = onSchedule(
  {
    schedule: "*/30 * * * *",
    timeZone: "America/Halifax",
    secrets: [googleOAuthClientSecret],
  },
  async () => {
    const tokensSnap = await db().collection("googleOAuthTokens").get();
    let userCount = 0;
    let captureCount = 0;

    for (const tokenDoc of tokensSnap.docs) {
      const token = tokenDoc.data();
      const userId = token.userId as string;
      const refreshToken = token.refreshToken as string | undefined;
      const scopes = Array.isArray(token.scopes) ? (token.scopes as string[]) : [];
      if (!refreshToken) continue;

      try {
        if (!(await shouldRunDebriefNow(userId))) continue;
        const accessToken = await refreshGoogleAccessToken(refreshToken);
        const imported = await syncGoogleForUser(userId, accessToken, scopes);
        userCount += 1;
        captureCount += imported;
        await tokenDoc.ref.update({
          lastSyncAt: FieldValue.serverTimestamp(),
          lastSyncStatus: "completed",
          lastImportedCount: imported,
        });
      } catch (error) {
        logger.error("Google integration sync failed", { userId, error });
        await tokenDoc.ref.update({
          lastSyncAt: FieldValue.serverTimestamp(),
          lastSyncStatus: "failed",
        });
      }
    }

    logger.info("Google integration sync complete", { userCount, captureCount });
  },
);

export const runGoogleDebriefNow = onCall(
  { secrets: [googleOAuthClientSecret], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const tokenDoc = await db().collection("googleOAuthTokens").doc(request.auth.uid).get();
    const token = tokenDoc.data();
    const refreshToken = token?.refreshToken as string | undefined;
    const scopes = Array.isArray(token?.scopes) ? (token?.scopes as string[]) : [];

    if (!refreshToken) {
      throw new HttpsError("failed-precondition", "Connect Gmail or Calendar first.");
    }

    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const imported = await syncGoogleForUser(request.auth.uid, accessToken, scopes);

    await tokenDoc.ref.update({
      lastManualSyncAt: FieldValue.serverTimestamp(),
      lastSyncAt: FieldValue.serverTimestamp(),
      lastSyncStatus: "completed",
      lastImportedCount: imported,
    });

    return { imported };
  },
);

/** Callable: batch AI review for unreviewed captures. */
export const runAiReview = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const userId = request.auth.uid;
    const capturesSnap = await db()
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
    const runRef = await db().collection("reviewRuns").add({
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
      const batch = db().batch();

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
  const usageRef = db().collection("aiUsage").doc(`${userId}_${monthKey}`);

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

function googleRedirectUri() {
  return `https://us-central1-homestud-os.cloudfunctions.net/${GOOGLE_REDIRECT_PATH.slice(1)}`;
}

async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: googleOAuthClientId.value(),
    client_secret: googleOAuthClientSecret.value(),
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  return (await response.json()) as GoogleTokenResponse;
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleOAuthClientId.value(),
    client_secret: googleOAuthClientSecret.value(),
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = (await response.json()) as GoogleTokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || "Google token refresh failed");
  }
  return token.access_token;
}

function hasCalendarReadScope(scopes: string[]) {
  return scopes.some(
    (scope) =>
      scope.includes("calendar.readonly") || scope.includes("calendar.events.readonly"),
  );
}

async function syncGoogleForUser(userId: string, accessToken: string, scopes: string[]) {
  let imported = 0;
  if (scopes.includes(`${GOOGLE_SCOPE_PREFIX}gmail.readonly`)) {
    imported += await syncGmailForUser(userId, accessToken);
  }
  if (hasCalendarReadScope(scopes)) {
    imported += await syncCalendarForUser(userId, accessToken);
  }
  return imported;
}

async function shouldRunDebriefNow(userId: string) {
  const settingsSnap = await db().collection("users").doc(userId).collection("settings").doc("harlan").get();
  const settings = settingsSnap.data();
  const debriefTime = typeof settings?.debriefTime === "string" ? settings.debriefTime : "20:30";
  const timezone = typeof settings?.timezone === "string" ? settings.timezone : "America/Halifax";
  const localTime = currentLocalTime(timezone);
  return localTime === debriefTime;
}

function currentLocalTime(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

async function syncGmailForUser(userId: string, accessToken: string) {
  const list = await googleApi<GmailThreadListResponse>(
    "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=10&q=newer_than:2d",
    accessToken,
  );

  let imported = 0;
  for (const thread of list.threads ?? []) {
    const detail = await googleApi<GmailThreadResponse>(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${thread.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      accessToken,
    );
    const firstMessage = detail.messages?.[0];
    const latestMessage = detail.messages?.[detail.messages.length - 1] ?? firstMessage;
    if (!firstMessage || !latestMessage) continue;

    const subject = gmailHeader(firstMessage, "Subject") || "(no subject)";
    const from = gmailHeader(firstMessage, "From") || "unknown sender";
    const date = gmailHeader(latestMessage, "Date") || "";
    const snippet = latestMessage.snippet || firstMessage.snippet || "";
    const captureId = `gmail_${thread.id}`;

    const captureRef = db().collection("captures").doc(captureId);
    const existing = await captureRef.get();
    if (existing.exists) continue;

    await captureRef.set({
      userId,
      type: "text",
      rawText: `Gmail thread: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${snippet}`,
      reviewStatus: "unreviewed",
      source: "gmail",
      gmailThreadId: thread.id,
      gmailMessageId: latestMessage.id,
      gmailSubject: subject,
      gmailFrom: from,
      gmailDate: date,
      gmailSnippet: snippet,
      createdAt: FieldValue.serverTimestamp(),
      capturedAt: FieldValue.serverTimestamp(),
    });
    imported += 1;
  }

  return imported;
}

async function syncCalendarForUser(userId: string, accessToken: string) {
  const timeMin = new Date();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 14);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());

  const data = await googleApi<CalendarEventsResponse>(url.toString(), accessToken);
  let imported = 0;

  for (const event of data.items ?? []) {
    if (!event.id || !event.summary) continue;

    const captureRef = db().collection("captures").doc(`calendar_${event.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`);
    const existing = await captureRef.get();
    if (existing.exists) continue;

    const startsAt = event.start?.dateTime ?? event.start?.date ?? "unknown time";
    const endsAt = event.end?.dateTime ?? event.end?.date ?? "unknown time";
    await captureRef.set({
      userId,
      type: "text",
      rawText: `Calendar event: ${event.summary}\nWhen: ${startsAt} to ${endsAt}\nLocation: ${event.location ?? ""}\n\n${event.description ?? ""}`,
      reviewStatus: "unreviewed",
      source: "calendar",
      calendarEventId: event.id,
      calendarEventLink: event.htmlLink ?? "",
      calendarTitle: event.summary,
      calendarLocation: event.location ?? "",
      eventStart: startsAt,
      eventEnd: endsAt,
      createdAt: FieldValue.serverTimestamp(),
      capturedAt: FieldValue.serverTimestamp(),
    });
    imported += 1;
  }

  return imported;
}

async function googleApi<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const data = await googleApi<{ email?: string }>(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      accessToken,
    );
    return typeof data.email === "string" ? data.email : null;
  } catch (error) {
    logger.warn("Could not fetch Google user email", error);
    return null;
  }
}

function gmailHeader(message: NonNullable<GmailThreadResponse["messages"]>[number], name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
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
  const assetRef = db().collection("assets").doc(assetId);
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
  await bucket().file(storagePath).save(markdown, {
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
  const decisionRef = db().collection("decisions").doc(decisionId);
  const decisionSnap = await decisionRef.get();

  if (!decisionSnap.exists || decisionSnap.data()?.userId !== userId) {
    throw new HttpsError("not-found", "Decision not found.");
  }

  const decision = decisionSnap.data()!;
  const projectFolder = projectVaultFolder(decision.projectId as ProjectId);
  const obsidianPath = `${projectFolder}/Decisions.md`;
  const entry = renderDecisionEntry(decision);

  const storagePath = `obsidian-export/${userId}/${obsidianPath}`;
  const file = bucket().file(storagePath);
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
