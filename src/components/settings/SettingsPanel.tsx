import { useEffect, useState } from "react";
import type React from "react";
import { CalendarDays, CheckCircle2, Mail, X } from "lucide-react";
import type { User } from "firebase/auth";
import {
  connectGoogleIntegration,
  getIntegrationConnection,
  getUserSettings,
  runGoogleDebriefNow,
  updateDebriefTime,
} from "../../data";
import type { IntegrationConnection, IntegrationId } from "../../types";

const integrations: Array<{
  id: IntegrationId;
  name: string;
  description: string;
  scopes: string[];
  icon: React.ReactNode;
}> = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Read-only inbox capture for follow-ups, waiting-ons, and open loops.",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    icon: <Mail size={20} />,
  },
  {
    id: "calendar",
    name: "Google Calendar",
    description: "Read-only calendar context for looking ahead and time-sensitive commitments.",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
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

  useEffect(() => {
    let mounted = true;

    async function loadConnections() {
      const [records, settings] = await Promise.all([
        Promise.all(
          integrations.map(async (integration) => [
            integration.id,
            await getIntegrationConnection(user.uid, integration.id),
          ] as const),
        ),
        getUserSettings(user.uid),
      ]);
      if (!mounted) return;
      setConnections(
        Object.fromEntries(records.filter(([, connection]) => connection)) as Partial<
          Record<IntegrationId, IntegrationConnection>
        >,
      );
      setDebriefTime(settings.debriefTime);
    }

    void loadConnections();
    return () => {
      mounted = false;
    };
  }, [user.uid]);

  async function connect(integration: (typeof integrations)[number]) {
    setConnecting(integration.id);
    setMessage(null);
    try {
      await connectGoogleIntegration({
        user,
        integrationId: integration.id,
        scopes: integration.scopes,
      });
      setMessage(`Redirecting to Google for ${integration.name}`);
    } catch {
      setMessage(`${integration.name} connection was not completed`);
    } finally {
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
            const connected = connections[integration.id]?.status === "connected";
            const isConnecting = connecting === integration.id;

            return (
              <article key={integration.id} className="integration-item">
                <div className="integration-icon">{integration.icon}</div>
                <div className="integration-copy">
                  <strong>{integration.name}</strong>
                  <p>{integration.description}</p>
                  {connected && (
                    <span className="integration-status">
                      <CheckCircle2 size={15} />
                      Connected
                    </span>
                  )}
                </div>
                <button
                  className={connected ? "secondary-button compact" : "primary-button compact"}
                  onClick={() => connect(integration)}
                  disabled={isConnecting}
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
          These grants are read-only. Harlan can capture context for review, but it will not send
          email or change calendar events.
        </p>
        {message && <p className="settings-message">{message}</p>}
      </section>
    </div>
  );
}
