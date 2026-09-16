"use client";

import { ArrowLeft, ArrowUpRight, CookingPot, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";

/**
 * The shared frame for every signed-out screen: brand, the marketing panel, and
 * an optional back link.
 */
export function AuthScreen({
  children,
  onBack,
  backLabel = "Back",
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-main">
        <header className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <CookingPot size={22} />
          </span>
          <span>
            <strong>MessMate</strong>
            <small>Shared living, sorted.</small>
          </span>
        </header>

        <div className="auth-content">
          {onBack && (
            <button className="auth-back" onClick={onBack} type="button">
              <ArrowLeft size={16} aria-hidden="true" /> {backLabel}
            </button>
          )}
          {children}
        </div>

        <footer className="auth-footer">
          <span>&copy; {new Date().getFullYear()} MessMate</span>
          <span>Built for shared homes</span>
        </footer>
      </section>

      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-aside-top">
          <span>BUILT FOR SHARED HOMES</span>
          <h2>
            Less calculation.
            <br />
            More living.
          </h2>
          <p>
            Every meal, bazar run and bill in one place, with the month&rsquo;s split worked out for
            you.
          </p>
        </div>

        <div className="auth-preview-card">
          <div className="preview-top">
            <span>
              <CookingPot size={17} /> How a month looks
            </span>
            <span className="preview-live">Example</span>
          </div>
          <div className="preview-balance">
            <span>Meal rate</span>
            <strong>&#2547;64.20</strong>
            <small>Approved bazar divided by everyone&rsquo;s meals</small>
          </div>
          <div className="preview-stats">
            <span>
              <small>Bazar</small>
              <strong>&#2547;18,400</strong>
            </span>
            <span>
              <small>Meals</small>
              <strong>287</strong>
            </span>
            <span>
              <small>Members</small>
              <strong>5</strong>
            </span>
          </div>
          <div className="preview-people">
            <span>Everyone sees the same numbers</span>
            <div className="avatar-stack">
              <Avatar name="Rafi Islam" color="#c9603f" size="sm" />
              <Avatar name="Nayeem Hasan" color="#3f6b80" size="sm" />
              <Avatar name="Ayon Dey" color="#6a66a0" size="sm" />
            </div>
          </div>
        </div>

        <blockquote>
          &ldquo;Month-end settlement finally takes minutes, not an entire evening.&rdquo;
          <footer>
            <Avatar name="Tahmid Noor" color="#a97c31" size="sm" />
            <span>
              <strong>Tahmid Noor</strong>
              <small>Mess manager &middot; Dhaka</small>
            </span>
          </footer>
        </blockquote>

        <div className="auth-aside-orbit orbit-one" />
        <div className="auth-aside-orbit orbit-two" />
      </aside>
    </main>
  );
}

export function SecureNote({ children }: { children: ReactNode }) {
  return (
    <p className="secure-note">
      <ShieldCheck size={17} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="demo-link" href={href}>
      {children} <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}
