export function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export type Tab = "dispatch" | "capture" | "review" | "projects";

export function tabTitle(tab: Tab) {
  if (tab === "dispatch") return "Dispatch";
  if (tab === "capture") return "Capture";
  if (tab === "review") return "Review";
  return "Projects";
}
