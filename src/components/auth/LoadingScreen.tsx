import { Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <main className="screen centered">
      <Loader2 className="spin" size={34} />
      <p>Loading HomeStud OS</p>
    </main>
  );
}
