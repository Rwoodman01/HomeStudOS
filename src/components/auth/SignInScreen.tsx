import { ShieldCheck } from "lucide-react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../firebase";

export function SignInScreen() {
  return (
    <main className="screen login">
      <section className="login-panel">
        <div className="brand-mark">
          <ShieldCheck size={34} />
        </div>
        <p className="eyebrow">HomeStud OS</p>
        <h1>Dispatch for the life you are building.</h1>
        <p className="lede">
          Capture what matters, review it cleanly, and see what needs your attention.
        </p>
        <button className="primary-button" onClick={() => signInWithPopup(auth, googleProvider)}>
          Sign in with Google
        </button>
      </section>
    </main>
  );
}
