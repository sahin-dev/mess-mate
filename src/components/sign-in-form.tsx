"use client";

import { ChevronRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AuthResponse } from "@/lib/types";
import { AuthScreen } from "@/components/auth-screen";
import { ActionButton } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";

type Mode = "signin" | "signup";

export function SignInForm({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const go = (response: AuthResponse) => {
    // A brand-new account has no mess yet, so it goes to the join step.
    router.replace(response.workspace ? "/dashboard" : "/join");
    router.refresh();
  };

  const run = async <T,>(callback: () => Promise<T>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      return await callback();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await run(() =>
      requestJson<AuthResponse>("/api/auth", {
        action: mode,
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    );
    if (result) go(result);
  };

  const openDemo = async (role: "manager" | "admin") => {
    const result = await run(() => requestJson<AuthResponse>("/api/auth", { action: "demo", role }));
    if (!result) return;
    if (role === "admin") {
      router.replace("/admin");
      router.refresh();
    } else {
      go(result);
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    const result = await run(() =>
      requestJson<{ message: string }>("/api/auth", { action: "forgot", email }),
    );
    if (result) setMessage(result.message);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
  };

  return (
    <AuthScreen>
      <div className="auth-step" key={mode}>
        <span className="auth-kicker">{mode === "signin" ? "WELCOME BACK" : "CREATE YOUR ACCOUNT"}</span>
        <h1>{mode === "signin" ? "Good to see you again." : "Start managing together."}</h1>
        <p>
          {mode === "signin"
            ? "Sign in to manage meals, bazar and your shared bills."
            : "One account can create a new mess or join one that already exists."}
        </p>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <label>
              Full name
              <span className="input-with-icon">
                <Users size={17} aria-hidden="true" />
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Your full name"
                  suppressHydrationWarning
                />
              </span>
            </label>
          )}

          <label>
            Email address
            <span className="input-with-icon">
              <Mail size={17} aria-hidden="true" />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                suppressHydrationWarning
              />
            </span>
          </label>

          <label>
            <span className="label-row">
              Password
              {mode === "signin" && (
                <button type="button" onClick={forgotPassword}>
                  Forgot password?
                </button>
              )}
            </span>
            <span className="input-with-icon">
              <LockKeyhole size={17} aria-hidden="true" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                suppressHydrationWarning
              />
              <button
                type="button"
                className="reveal-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
          </label>

          {mode === "signup" && (
            <label className="terms-check">
              <input type="checkbox" required />
              <span>I agree to the terms of service and privacy policy.</span>
            </label>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="field-success" role="status">
              {message}
            </p>
          )}

          <ActionButton
            busy={busy}
            busyLabel={mode === "signin" ? "Signing in…" : "Creating account…"}
            className="auth-primary"
            type="submit"
          >
            {mode === "signin" ? "Sign in" : "Create account"}{" "}
            <ChevronRight size={17} aria-hidden="true" />
          </ActionButton>
        </form>

        <div className="auth-divider">
          <span>{mode === "signin" ? "New to MessMate?" : "Already have an account?"}</span>
        </div>
        <button
          type="button"
          className="auth-secondary"
          onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Create a free account" : "Sign in instead"}
        </button>

        {demoEnabled && (
          <div className="demo-actions">
            <button type="button" className="demo-link" disabled={busy} onClick={() => openDemo("manager")}>
              Explore the manager demo
            </button>
            <button
              type="button"
              className="demo-link admin"
              disabled={busy}
              onClick={() => openDemo("admin")}
            >
              <ShieldCheck size={14} aria-hidden="true" /> Admin demo
            </button>
          </div>
        )}
      </div>
    </AuthScreen>
  );
}
