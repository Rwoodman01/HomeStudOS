import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, Mail, X } from "lucide-react";
import type { User } from "firebase/auth";
import { auth } from "../../firebase";
import {
  connectGoogleIntegration,
  getIntegrationConnection,
  getUserSettings,
  parseIntegrationOAuthReturn,
  runGoogleDebriefNow,
  updateDebriefTime,
} from "../../data";
import type { IntegrationConnection, IntegrationId, IntegrationStatus } from "../../types";

const integrations: Array<{
  id: IntegrationId;
  name: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "gmail",
    name: "Gmail",
    description:
      "Harlan reads inbox context for attention items. Compose permission enables future project manager drafts — Bobby always sends.",
    icon: <Mail size={20} />,
  },
  {
    id: "calendar",
    name: "Google Calendar",
    description: "Read-only calendar context for looking ahead and time-sensitive commitments.",
    icon: <CalendarDays size={20} />,
  },
];

const debriefTimes = [
  { value: "18:30", label: "6:30 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "19:30", label: "7:30 PM" },
  { value: "20:00", label: "8:00 PM" },
  { value: "20:30", label: "8:30 PM" },
  { value: "21:00", label: "9:00 PM" },
  { value: "21:30", label: "9:30 PM" },
];

function integrationDisplayName(integrationId: IntegrationId) {
  return integrations.find((integration) => integration.id === integrationId)?.name ?? integrationId;
}

function resolveIntegrationStatus(
  connection: IntegrationConnection | undefined,
  isConnecting: boolean,
): IntegrationStatus | "connecting" {
  if (isConnecting) return "connecting";
  if (!connection) return "not_connected";
  return connection.status;
}

function IntegrationStatusBadge({
  status,
  email,
  errorMessage,
}: {
  status: IntegrationStatus | "connecting";
  email?: string | null;
  errorMessage?: string | null;
}) {
  if (status === "connecting") {
    return (
      <span className="integration-status connecting">
        <Loader2 size={15} />
        Connecting
      </span>
    );
  }
  if (status === "connected") {
    return (
      <>
        <span className="integration-status connected">
          <CheckCircle2 size={15} />
          Connected
        </span>
        {email && <span className="integration-email">Connected as {email}</span>}
      </>
    );
  }
  if (status === "error") {
    return (
      <span className="integration-status error" title={errorMessage ?? undefined}>
        <AlertCircle size={15} />
        Error
      </span>
    );
  }
  return <span className="integration-status disconnected">Not Connected</span>;
}

export function SettingsPanel({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [connections, setConnections] = useState<Partial<Record<IntegrationId, IntegrationConnection>>>({});
  const [connecting, setConnecting] = useState<IntegrationId | null>(null);
  const [debriefTime, setDebriefTime] = useState("20:30");
  const [savingDebriefTime, setSavingDebriefTime] = useState(false);
  const [runningDebrief, setRunningDebrief] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    const [records, settings] = await Promise.all([
      Promise.all(
        integrations.map(async (integration) => [
          integration.id,
          await getIntegrationConnection(user.uid, integration.id),
        ] as const),
      ),
      getUserSettings(user.uid),
    ]);
    setConnections(
      Object.fromEntries(records.filter(([, connection]) => connection)) as Partial<
        Record<IntegrationId, IntegrationConnection>
      >,
    );
    setDebriefTime(settings.debriefTime);
  }, [user.uid]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const oauthReturn = parseIntegrationOAuthReturn();
      await loadConnections();
      if (!mounted) return;

      if (oauthReturn.outcome === "success") {
        setMessage(`${integrationDisplayName(oauthReturn.integrationId)} connected.`);
      } else if (oauthReturn.outcome === "failed") {
        setMessage(`${integrationDisplayName(oauthReturn.integrationId)} connection failed. Try again.`);
      }
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [loadConnections]);

  async function connect(integration: (typeof integrations)[number]) {
    if (!auth.currentUser) {
      setMessage("Sign in required before connecting an integration.");
      return;
    }

    setConnecting(integration.id);
    setMessage(null);
    try {
      await connectGoogleIntegration(integration.id);
      setMessage(`Redirecting to Google for ${integration.name}`);
    } catch {
      setMessage(`${integration.name} connection was not completed`);
      setConnecting(null);
    }
  }

  async function saveDebriefTime(nextDebriefTime: string) {
    setDebriefTime(nextDebriefTime);
    setSavingDebriefTime(true);
    setMessage(null);
    try {
      await updateDebriefTime(user.uid, nextDebriefTime);
      const label = debriefTimes.find((time) => time.value === nextDebriefTime)?.label ?? nextDebriefTime;
      setMessage(`Night debrief set for ${label}`);
    } catch {
      setMessage("Debrief time was not saved");
    } finally {
      setSavingDebriefTime(false);
    }
  }

  async function runDebriefNow() {
    setRunningDebrief(true);
    setMessage(null);
    try {
      const result = await runGoogleDebriefNow();
      setMessage(
        `Debrief complete. Imported ${result.imported} new capture${
          result.imported === 1 ? "" : "s"
        }.`,
      );
    } catch {
      setMessage("Debrief could not run. Connect Gmail or Calendar first.");
    } finally {
      setRunningDebrief(false);
    }
  }

  return (
    <div className="settings-backdrop" role="presentation">
      <section className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Integrations</h2>
          </div>
          <button className="icon-button" aria-label="Close settings" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="integration-list">
          {integrations.map((integration) => {
            const connection = connections[integration.id];
            const isConnecting = connecting === integration.id;
            const status = resolveIntegrationStatus(connection, isConnecting);
            const connected = status === "connected";

            return (
              <article key={integration.id} className="integration-item">
                <div className="integration-icon">{integration.icon}</div>
                <div className="integration-copy">
                  <strong>{integration.name}</strong>
                  <p>{integration.description}</p>
                  <IntegrationStatusBadge
                    status={status}
                    email={connection?.email}
                    errorMessage={connection?.errorMessage}
                  />
                </div>
                <button
                  className={connected ? "secondary-button compact" : "primary-button compact"}
                  onClick={() => connect(integration)}
                  disabled={isConnecting || !auth.currentUser}
                >
                  {connected ? "Reconnect" : isConnecting ? "Connecting" : "Connect"}
                </button>
              </article>
            );
          })}
        </div>

        <section className="settings-section">
          <div>
            <p className="eyebrow">Harlan Rhythm</p>
            <h3>Night debrief</h3>
            <p>
              Harlan sweeps Gmail and Calendar at this time, then queues open loops for review.
            </p>
          </div>
          <select
            className="settings-select"
            value={debriefTime}
            onChange={(event) => saveDebriefTime(event.target.value)}
            disabled={savingDebriefTime}
            aria-label="Night debrief time"
          >
            {debriefTimes.map((time) => (
              <option key={time.value} value={time.value}>
                {time.label}
              </option>
            ))}
          </select>
        </section>

        <section className="settings-section">
          <div>
            <p className="eyebrow">Manual Run</p>
            <h3>Debrief now</h3>
            <p>Pull Gmail and Calendar into Harlan captures without waiting for tonight.</p>
          </div>
          <button className="secondary-button compact" onClick={runDebriefNow} disabled={runningDebrief}>
            {runningDebrief ? "Running" : "Run now"}
          </button>
        </section>

        <p className="settings-note">
          Harlan reads email and calendar for attention only — needs reply, overdue follow-ups,
          manager drafts ready for review. Harlan does not send email or change calendar events.
          Project manager agents may create Gmail drafts; sending always requires Bobby.
        </p>
        {message && <p className="settings-message">{message}</p>}
      </section>
    </div>
  );
}
