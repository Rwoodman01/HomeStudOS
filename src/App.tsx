import { useAuth } from "./hooks/useAuth";
import { LoadingScreen } from "./components/auth/LoadingScreen";
import { SignInScreen } from "./components/auth/SignInScreen";
import { CommandCenter } from "./components/layout/CommandCenter";

export function App() {
  const { user, authReady } = useAuth();

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <SignInScreen />;
  }

  return <CommandCenter user={user} />;
}
