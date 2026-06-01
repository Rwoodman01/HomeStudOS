import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setTokenReady(false);
        return;
      }

      setTokenReady(false);
      void nextUser
        .getIdToken()
        .then(() => setTokenReady(true))
        .catch(() => setTokenReady(false));
    });
  }, []);

  return { user, authReady, tokenReady };
}
