"use client";

import { Check, Copy, Loader2, TriangleAlert, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { avatarUrl } from "@/lib/avatar";
import { copyText, initialsOf } from "@/lib/format";

export function Avatar({
  name,
  color,
  size = "md",
  avatarId,
}: {
  name: string;
  color: string;
  size?: "sm" | "md";
  /** A profile picture to show instead of initials, when the person has one. */
  avatarId?: string | null;
}) {
  const className = `avatar ${size === "sm" ? "avatar-small" : ""}`;
  if (avatarId) {
    // Decorative in every place an avatar appears: the name is always written
    // next to it, so alt text would only repeat it to a screen reader.
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- served from our
         own route at a fixed 256px, already squared and downscaled. */
      <img className={`${className} avatar-photo`} src={avatarUrl(avatarId)} alt="" loading="lazy" />
    );
  }
  return (
    <span className={className} style={{ backgroundColor: color }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <Loader2 size={16} aria-hidden="true" />
    </span>
  );
}

/** A button that shows its own pending state instead of only going disabled. */
export function ActionButton({
  busy,
  busyLabel,
  children,
  className = "button button-dark",
  ...rest
}: {
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={className} disabled={busy || rest.disabled} aria-busy={busy}>
      {busy ? (
        <>
          <Spinner label={busyLabel ?? "Working"} />
          {busyLabel ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function CopyButton({
  value,
  label = "Copy code",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => setCopied(await copyText(value))}
    >
      {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Keeps keyboard focus inside the dialog while it is open, returns focus to
 * whatever opened it, and closes on Escape — none of which a plain div does.
 */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

    const first = focusable()[0];
    (first ?? ref.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstElement || !ref.current?.contains(active))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && active === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return ref;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useDialog(onClose);
  const titleId = useId();
  const subtitleId = useId();
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p id={subtitleId}>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
};

/** Deleting a member, room or expense is not undoable, so it always asks first. */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      await request.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [request, onClose]);

  return (
    <Modal title={request.title} onClose={onClose}>
      <div className="confirm-body">
        <span className={`confirm-icon ${request.tone === "danger" ? "danger" : ""}`}>
          <TriangleAlert size={22} aria-hidden="true" />
        </span>
        <p>{request.message}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>
          Cancel
        </button>
        <ActionButton
          busy={busy}
          busyLabel="Working…"
          className={`button ${request.tone === "danger" ? "button-danger" : "button-dark"}`}
          onClick={run}
        >
          {request.confirmLabel}
        </ActionButton>
      </div>
    </Modal>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-icon">{icon}</span>}
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function SectionHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="view-title-row">
      <div>
        {kicker && <span className="eyebrow green-text">{kicker}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="view-actions">{action}</div>}
    </div>
  );
}
