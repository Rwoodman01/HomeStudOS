import { useState } from "react";
import { FolderKanban, Home, Inbox, LogOut, Plus, Settings } from "lucide-react";
import { signOut, type User } from "firebase/auth";
import { auth } from "../../firebase";
import { useCommandCenterData } from "../../hooks/useCommandCenterData";
import { CapturePanel } from "../capture/CapturePanel";
import { Dispatch } from "../dispatch/Dispatch";
import { ProjectsPanel } from "../projects/ProjectsPanel";
import { ReviewPanel } from "../review/ReviewPanel";
import { SettingsPanel } from "../settings/SettingsPanel";
import { NavButton, tabTitle, type Tab } from "./NavButton";

export function CommandCenter({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("dispatch");
  const [settingsOpen, setSettingsOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("settings") === "integrations";
  });
  const {
    captures,
    waitingOns,
    assets,
    decisions,
    openActions,
    reviewCaptures,
    unreviewedCount,
    syncMessage,
  } = useCommandCenterData(user.uid);

  return (
    <main className="app-shell">
      {syncMessage && <div className="sync-toast">{syncMessage}</div>}
      <header className="topbar">
        <div>
          <p className="eyebrow">HomeStud OS</p>
          <h1>{tabTitle(tab)}</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={20} />
          </button>
          <button className="icon-button" aria-label="Sign out" onClick={() => signOut(auth)}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <section className="content">
        {tab === "dispatch" && (
          <Dispatch
            actions={openActions}
            waitingOns={waitingOns}
            reviewCount={reviewCaptures.length}
            captures={captures}
          />
        )}
        {tab === "capture" && <CapturePanel userId={user.uid} />}
        {tab === "review" && (
          <ReviewPanel
            userId={user.uid}
            captures={reviewCaptures}
            unreviewedCount={unreviewedCount}
          />
        )}
        {tab === "projects" && (
          <ProjectsPanel
            actions={openActions}
            assets={assets}
            decisions={decisions}
            captures={captures}
          />
        )}
      </section>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavButton
          active={tab === "dispatch"}
          icon={<Home size={20} />}
          label="Dispatch"
          onClick={() => setTab("dispatch")}
        />
        <NavButton
          active={tab === "capture"}
          icon={<Plus size={20} />}
          label="Capture"
          onClick={() => setTab("capture")}
        />
        <NavButton
          active={tab === "review"}
          icon={<Inbox size={20} />}
          label="Review"
          onClick={() => setTab("review")}
        />
        <NavButton
          active={tab === "projects"}
          icon={<FolderKanban size={20} />}
          label="Projects"
          onClick={() => setTab("projects")}
        />
      </nav>

      {settingsOpen && <SettingsPanel user={user} onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
