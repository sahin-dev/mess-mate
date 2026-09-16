"use client";

import { Check, ChevronRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { ActionButton } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 8 && confirm === password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestJson<{ message: string }>("/api/auth", {
        action: "resetPassword",
        token,
        password,
      });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthScreen>
        <div className="auth-step created-step">
          <span className="success-ring" aria-hidden="true">
            <Check size={29} />
          </span>
          <span className="auth-kicker">PASSWORD CHANGED</span>
          <h1>You are all set.</h1>
          <p>
            Your password has been changed and every other device has been signed out. Sign in with
            the new one.
          </p>
          <button className="auth-primary" type="button" onClick={() => router.replace("/signin")}>
            Go to sign in <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <div className="auth-step">
        <span className="auth-kicker">RESET PASSWORD</span>
        <h1>Choose a new password.</h1>
        <p>Pick something at least 8 characters long that you do not use anywhere else.</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            New password
            <span className="input-with-icon">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                autoFocus
                type={show ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                className="reveal-button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
          </label>

          <label>
            Confirm new password
            <span className="input-with-icon">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Type it again"
              />
            </span>
          </label>

          {tooShort && <p className="field-error">Use at least 8 characters.</p>}
          {mismatch && <p className="field-error">Those two do not match.</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <ActionButton
            busy={busy}
            busyLabel="Saving…"
            className="auth-primary"
            type="submit"
            disabled={!canSubmit}
          >
            Change password <ChevronRight size={17} aria-hidden="true" />
          </ActionButton>
        </form>

        <p className="auth-switch">
          Remembered it? <Link href="/signin">Sign in instead</Link>
        </p>
      </div>
    </AuthScreen>
  );
}

export function ResetLinkProblem() {
  return (
    <AuthScreen>
      <div className="auth-step">
        <span className="auth-kicker">RESET PASSWORD</span>
        <h1>That link is no longer valid.</h1>
        <p>
          Reset links work once and expire after a short while. Ask for a new one and use the most
          recent email.
        </p>
        <Link className="auth-primary" href="/signin">
          Back to sign in <ChevronRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </AuthScreen>
  );
}
