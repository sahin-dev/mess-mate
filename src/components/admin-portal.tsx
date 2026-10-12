"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  ExternalLink,
  Flag,
  Gauge,
  HeartPulse,
  KeyRound,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PresencePing } from "@/components/presence-ping";
import { downloadCsv, formatDate, formatMoney, pluralize, relativeTime } from "@/lib/format";
import type {
  AdminActivityRow,
  AdminAnnouncementRow,
  AdminAuditRow,
  AdminHealth,
  AdminHealthCheck,
  AdminListingRow,
  AdminMessDetail,
  AdminMessRow,
  AdminOverview,
  AdminPage,
  AdminReportRow,
  AdminUserDetail,
  AdminUserRow,
  AnnouncementAudience,
  AnnouncementTone,
  ListingReportReason,
} from "@/lib/types";
import { ActionButton, Avatar, ConfirmDialog, EmptyState, Modal, Spinner, type ConfirmRequest } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";
import { isAdminView, type AdminView } from "@/lib/admin-views";

const ADMIN_NAV: { id: AdminView; label: string; icon: typeof Gauge; group: "console" | "platform" }[] = [
  { id: "overview", label: "Overview", icon: Gauge, group: "console" },
  { id: "users", label: "Users", icon: Users, group: "console" },
  { id: "messes", label: "Messes", icon: Building2, group: "console" },
  { id: "listings", label: "Listings & reports", icon: Flag, group: "console" },
  { id: "announcements", label: "Announcements", icon: Megaphone, group: "platform" },
  { id: "activity", label: "Workspace activity", icon: Activity, group: "platform" },
  { id: "audit", label: "Admin audit log", icon: ClipboardList, group: "platform" },
  { id: "health", label: "System health", icon: HeartPulse, group: "platform" },
];

const TITLES: Record<AdminView, [string, string]> = {
  overview: ["Platform overview", "Live figures and anything that needs you."],
  users: ["Users", "Find an account, see where it belongs, and act on it."],
  messes: ["Messes", "Every house on this deployment."],
  listings: ["Listings & reports", "Moderate public to-let posts and what visitors report."],
  announcements: ["Announcements", "Messages shown across the top of every workspace."],
  activity: ["Workspace activity", "Events recorded inside every mess."],
  audit: ["Admin audit log", "Every change an administrator has made, and who made it."],
  health: ["System health", "Configuration, database and runtime, checked now."],
};

const REPORT_REASON: Record<ListingReportReason, string> = {
  scam: "Scam or fraud",
  unavailable: "Room no longer available",
  misleading: "Misleading details or photos",
  discriminatory: "Discriminatory",
  offensive: "Offensive content",
  other: "Something else",
};

type Toast = { id: number; message: string; tone: "success" | "error" };

type AdminContext = {
  act: (action: string, payload: Record<string, unknown>) => Promise<boolean>;
  confirm: (request: ConfirmRequest) => void;
  askReason: (request: ReasonRequest) => void;
  busy: boolean;
  /** Bumped after every successful change, so open views reload. */
  version: number;
};

type ReasonRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  placeholder: string;
  optional?: boolean;
  tone?: "danger" | "default";
  onSubmit: (reason: string) => Promise<void>;
};

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

function useAdminQuery<T>(url: string | null, version: number) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string }>({
    url: null,
    data: null,
    error: "",
  });
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!url) return;
    let active = true;
    requestJson<T>(url)
      .then((data) => {
        if (active) setState({ url, data, error: "" });
      })
      .catch((caught: unknown) => {
        if (active) {
          setState((current) => ({
            url,
            data: current.url === url ? current.data : null,
            error: caught instanceof Error ? caught.message : "That could not be loaded.",
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [url, version, token]);

  const loading = Boolean(url) && state.url !== url;
  return {
    // The previous result stays on screen, dimmed, while the next one loads.
    data: state.data,
    error: state.url === url ? state.error : "",
    loading,
    reload: useCallback(() => setToken((value) => value + 1), []),
  };
}

function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "All") search.set(key, String(value));
  }
  return search.toString();
}

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

export function AdminPortal({ userName, initialView }: { userName: string; initialView: AdminView }) {
  const router = useRouter();
  const [view, setView] = useState<AdminView>(initialView);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);
  const toastId = useRef(0);
  const overview = useAdminQuery<AdminOverview>("/api/admin?view=overview", version);

  const notify = useCallback((message: string, tone: Toast["tone"] = "success") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      tone === "error" ? 7000 : 3600,
    );
  }, []);

  const act = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        const result = await requestJson<{ message?: string }>("/api/admin", { action, ...payload });
        notify(result.message ?? "Done.");
        setVersion((value) => value + 1);
        return true;
      } catch (error) {
        notify(error instanceof Error ? error.message : "That could not be completed.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  // The view lives in the address bar, so refresh and the back button work.
  const openView = (next: AdminView) => {
    setView(next);
    setDrawerOpen(false);
    const url = next === "overview" ? "/admin" : `/admin?view=${next}`;
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = () => {
      const param = new URLSearchParams(window.location.search).get("view");
      setView(isAdminView(param) ? param : "overview");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const signOut = async () => {
    try {
      await requestJson<{ ok: boolean }>("/api/auth", { action: "signout" });
    } catch {
      // The redirect below still leaves the console.
    }
    router.replace("/signin");
  };

  const context: AdminContext = {
    act,
    confirm: setConfirmRequest,
    askReason: setReasonRequest,
    busy,
    version,
  };
  const badges: Partial<Record<AdminView, number>> = {
    listings: overview.data?.queue.openReports ?? 0,
    health: overview.data?.warnings.filter((check) => check.status === "error").length ?? 0,
  };
  const [heading, subtitle] = TITLES[view];

  return (
    <div className="admin-shell">
      <PresencePing />
      <a className="skip-link" href="#admin-content">
        Skip to main content
      </a>
      <button
        className={`admin-overlay ${drawerOpen ? "show" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
      />

      <aside className={`admin-sidebar ${drawerOpen ? "open" : ""}`} aria-label="Admin navigation">
        <div className="sidebar-top">
          <Link className="admin-brand" href="/admin" aria-label="MessMate admin home">
            <span className="brand-mark" aria-hidden="true">
              <ShieldCheck size={21} />
            </span>
            <span>
              <strong>MessMate</strong>
              <small>Platform administration</small>
            </span>
          </Link>
          <button className="drawer-close icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav>
          {(["console", "platform"] as const).map((group) => (
            <div key={group}>
              <span className={`nav-label ${group === "platform" ? "second" : ""}`}>
                {group === "console" ? "CONSOLE" : "PLATFORM"}
              </span>
              <ul>
                {ADMIN_NAV.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={view === id ? "active" : ""}
                      aria-current={view === id ? "page" : undefined}
                      onClick={() => openView(id)}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span>{label}</span>
                      {(badges[id] ?? 0) > 0 && (
                        <i className="admin-nav-badge" aria-label={`${badges[id]} need attention`}>
                          {badges[id]}
                        </i>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Link className="sidebar-external admin-public-link" href="/community" target="_blank">
            <ExternalLink size={16} aria-hidden="true" />
            <span>
              <strong>Public community</strong>
              <small>See what visitors see</small>
            </span>
          </Link>
          <div className="profile-row">
            <Avatar name={userName} color="#5c6ca6" size="sm" />
            <span>
              <strong>{userName}</strong>
              <small>Platform administrator</small>
            </span>
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="headline-wrap">
            <button className="admin-menu icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
              <Menu size={20} aria-hidden="true" />
            </button>
            <div>
              <h1>{heading}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="button button-outline button-tiny"
              onClick={() => setVersion((value) => value + 1)}
              disabled={busy}
            >
              <RefreshCw size={14} aria-hidden="true" /> Refresh
            </button>
          </div>
        </header>

        <main id="admin-content" className="admin-content">
          {view === "overview" && (
            <OverviewView
              data={overview.data}
              error={overview.error}
              onRetry={overview.reload}
              onNavigate={openView}
            />
          )}
          {view === "users" && <UsersView ctx={context} />}
          {view === "messes" && <MessesView ctx={context} />}
          {view === "listings" && <ListingsView ctx={context} />}
          {view === "announcements" && <AnnouncementsView ctx={context} />}
          {view === "activity" && <ActivityView version={version} />}
          {view === "audit" && <AuditView version={version} />}
          {view === "health" && <HealthView version={version} />}
        </main>
      </div>

      {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />}
      {reasonRequest && <ReasonDialog request={reasonRequest} onClose={() => setReasonRequest(null)} />}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast ${toast.tone}`} role="status">
            {toast.tone === "success" ? <CheckCircle2 size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReasonDialog({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await request.onSubmit(reason.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={request.title} subtitle={request.message} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          {request.optional ? "Note (optional)" : "Reason"}
          <textarea
            autoFocus
            rows={3}
            maxLength={300}
            required={!request.optional}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={request.placeholder}
          />
        </label>
        <p className="muted-note">Recorded in the admin audit log.</p>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            busy={busy}
            busyLabel="Working…"
            type="submit"
            className={`button ${request.tone === "danger" ? "button-danger" : "button-dark"}`}
            disabled={!request.optional && !reason.trim()}
          >
            {request.confirmLabel}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function LoadState({ error, onRetry, label }: { error: string; onRetry?: () => void; label: string }) {
  if (error) {
    return (
      <section className="admin-panel">
        <EmptyState
          icon={<ShieldAlert size={22} aria-hidden="true" />}
          title="Could not load this"
          message={error}
          action={
            onRetry ? (
              <button className="button button-dark" onClick={onRetry}>
                Try again
              </button>
            ) : undefined
          }
        />
      </section>
    );
  }
  return (
    <section className="admin-panel loading-panel">
      <Spinner label={label} /> {label}&hellip;
    </section>
  );
}

function Toolbar({
  search,
  onSearch,
  placeholder,
  filter,
  onFilter,
  options,
  children,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  filter?: string;
  onFilter?: (value: string) => void;
  options?: string[];
  children?: ReactNode;
}) {
  return (
    <div className="directory-toolbar">
      {onSearch ? (
        <label className="admin-filter-search">
          <Search size={15} aria-hidden="true" />
          <span className="visually-hidden">{placeholder}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={placeholder}
          />
        </label>
      ) : (
        <span />
      )}
      <div>
        {options && onFilter && (
          <label>
            <span className="visually-hidden">Filter</span>
            <select value={filter} onChange={(event) => onFilter(event.target.value)}>
              {options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        {children}
      </div>
    </div>
  );
}

function Pager<T>({ page, onPage }: { page: AdminPage<T>; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.total, page.page * page.pageSize);
  return (
    <div className="admin-pager">
      <span>
        {page.total === 0 ? "No results" : `${from.toLocaleString()}–${to.toLocaleString()} of ${page.total.toLocaleString()}`}
      </span>
      <div>
        <button type="button" onClick={() => onPage(page.page - 1)} disabled={page.page <= 1} aria-label="Previous page">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span>
          Page {page.page} of {pages}
        </span>
        <button type="button" onClick={() => onPage(page.page + 1)} disabled={page.page >= pages} aria-label="Next page">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`admin-status ${status.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>;
}

function TimeAgo({ iso, fallback = "Never" }: { iso: string | null; fallback?: string }) {
  if (!iso) return <span className="cell-muted">{fallback}</span>;
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {relativeTime(iso)}
    </time>
  );
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function OverviewView({
  data,
  error,
  onRetry,
  onNavigate,
}: {
  data: AdminOverview | null;
  error: string;
  onRetry: () => void;
  onNavigate: (view: AdminView) => void;
}) {
  if (!data) return <LoadState error={error} onRetry={onRetry} label="Loading platform data" />;
  const maxSignups = Math.max(...data.signups.map((point) => point.users), 1);
  const newThisMonth = data.signups[data.signups.length - 1]?.users ?? 0;
  const queue = [
    { label: "Open reports", value: data.queue.openReports, view: "listings" as const, icon: Flag, urgent: data.queue.openReports > 0 },
    { label: "Suspended accounts", value: data.queue.suspendedUsers, view: "users" as const, icon: Ban, urgent: false },
    { label: "Suspended messes", value: data.queue.suspendedMesses, view: "messes" as const, icon: ShieldOff, urgent: false },
    { label: "Running announcements", value: data.queue.runningAnnouncements, view: "announcements" as const, icon: Megaphone, urgent: false },
  ];

  return (
    <>
      <div className="admin-page-actions">
        <div>
          <span className="admin-live">
            <i aria-hidden="true" /> Live platform data
          </span>
          <span suppressHydrationWarning>Updated {relativeTime(data.generatedAt)}</span>
        </div>
        <div>
          <button
            onClick={() =>
              downloadCsv("messmate-platform-summary.csv", [
                ["Metric", "Value"],
                ["Registered users", data.stats.users],
                ["Online now", data.stats.onlineNow],
                ["Active today", data.stats.activeDay],
                ["Active this week", data.stats.activeWeek],
                ["Active this month", data.stats.activeMonth],
                ["Messes", data.stats.messes],
                ["Messes with members", data.stats.activeMesses],
                ["Published listings", data.stats.publishedListings],
                ["Meal entries", data.stats.meals],
                ["Bazar entries", data.stats.bazar],
                ["Rooms", data.stats.rooms],
                ["Expense volume", data.stats.expenseVolume],
                ["Open reports", data.queue.openReports],
                ["Generated at", data.generatedAt],
              ])
            }
          >
            <Download size={15} aria-hidden="true" /> Export summary
          </button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <section className="admin-panel admin-warnings" aria-labelledby="admin-warnings-title">
          <div className="admin-panel-head">
            <div>
              <span>CONFIGURATION</span>
              <h3 id="admin-warnings-title">
                {pluralize(data.warnings.length, "setting needs", "settings need")} attention
              </h3>
            </div>
            <button className="admin-text-button" onClick={() => onNavigate("health")}>
              Open system health
            </button>
          </div>
          <ul className="check-list">
            {data.warnings.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        </section>
      )}

      <section className="admin-queue" aria-label="Needs attention">
        {queue.map(({ label, value, view, icon: Icon, urgent }) => (
          <button type="button" key={label} className={urgent ? "urgent" : ""} onClick={() => onNavigate(view)}>
            <Icon size={18} aria-hidden="true" />
            <span>
              <strong>{value.toLocaleString()}</strong>
              <small>{label}</small>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </section>

      <section className="admin-metrics">
        <AdminMetric label="Registered users" value={data.stats.users.toLocaleString()} detail="Accounts in the database" icon={Users} tone="violet" />
        <AdminMetric
          label="Active this week"
          value={data.stats.activeWeek.toLocaleString()}
          detail={`${data.stats.activeDay.toLocaleString()} today · ${data.stats.activeMonth.toLocaleString()} this month`}
          icon={UserCheck}
          tone="green"
        />
        <AdminMetric label="Online now" value={data.stats.onlineNow.toLocaleString()} detail="Tabs open and being looked at" icon={Radio} tone="coral" />
        <AdminMetric label="Expense volume" value={formatMoney(data.stats.expenseVolume)} detail="Recorded across all messes" icon={BarChart3} tone="blue" />
      </section>

      {data.stats.activityPartial && (
        <p className="admin-stat-note">
          Activity is counted from each account&apos;s last visit, which is only recorded from the
          moment this dashboard started tracking it. Accounts that have not signed in since are not
          counted yet, so these figures will rise over the first few weeks.
        </p>
      )}

      <section className="admin-metrics">
        <AdminMetric label="Messes" value={data.stats.messes.toLocaleString()} detail={`${data.stats.activeMesses} with active members`} icon={Building2} tone="blue" />
        <AdminMetric label="Published rooms" value={data.stats.publishedListings.toLocaleString()} detail="Live on the community" icon={Flag} tone="coral" />
        <AdminMetric label="Meal entries" value={data.stats.meals.toLocaleString()} detail="All time" icon={Activity} tone="violet" />
        <AdminMetric label="Bazar entries" value={data.stats.bazar.toLocaleString()} detail="All time" icon={Activity} tone="green" />
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel growth-panel">
          <div className="admin-panel-head">
            <div>
              <span>SIGN-UPS</span>
              <h3>New accounts by month</h3>
            </div>
            <span className="growth-total">
              <b>{newThisMonth}</b>
              <small>this month</small>
            </span>
          </div>
          {data.signups.every((point) => point.users === 0) ? (
            <EmptyState title="No sign-ups yet" message="New accounts will appear here as people register." />
          ) : (
            <div className="admin-bar-chart" role="img" aria-label={data.signups.map((p) => `${p.label} ${p.users}`).join(", ")}>
              {data.signups.map((point, index) => (
                <div key={point.period}>
                  <span
                    style={{ height: `${point.users > 0 ? Math.max(5, (point.users / maxSignups) * 100) : 2}%` }}
                    className={index === data.signups.length - 1 ? "current" : ""}
                    title={`${point.label}: ${point.users} users, ${point.messes} messes`}
                  />
                  <small>{point.label}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-panel usage-panel">
          <div className="admin-panel-head">
            <div>
              <span>RECORD VOLUME</span>
              <h3>What is being used</h3>
            </div>
          </div>
          <ul className="usage-list">
            {data.featureUsage.map((row, index) => (
              <li key={row.label}>
                <span>
                  <strong>{row.label}</strong>
                  <small>{pluralize(row.count, "record")}</small>
                </span>
                <div>
                  <i className={["coral", "green", "blue", "violet"][index % 4]} style={{ width: `${Math.min(100, row.share)}%` }} />
                </div>
                <b>{row.share}%</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="admin-lower-grid">
        <section className="admin-panel recent-messes">
          <div className="admin-panel-head">
            <div>
              <span>WORKSPACES</span>
              <h3>Recently created messes</h3>
            </div>
            <button className="admin-text-button" onClick={() => onNavigate("messes")}>
              View all
            </button>
          </div>
          {data.recentMesses.length === 0 ? (
            <EmptyState title="No messes yet" message="Messes appear here once someone creates one." />
          ) : (
            <div className="admin-table">
              <div className="admin-table-head">
                <span>Mess</span>
                <span>Manager</span>
                <span>Members</span>
                <span>Last activity</span>
                <span>Status</span>
              </div>
              {data.recentMesses.map((mess, index) => (
                <div className="admin-table-row" key={mess.id}>
                  <div>
                    <span className={`mess-mini m${index % 4}`} aria-hidden="true">
                      {mess.name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{mess.name}</strong>
                  </div>
                  <span>{mess.manager}</span>
                  <span>{mess.members}</span>
                  <TimeAgo iso={mess.lastActivityAt} />
                  <StatusBadge status={mess.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-panel health-summary">
          <div className="admin-panel-head">
            <div>
              <span>RECENT</span>
              <h3>Workspace activity</h3>
            </div>
            <button className="admin-text-button" onClick={() => onNavigate("activity")}>
              View all
            </button>
          </div>
          {data.activity.length === 0 ? (
            <EmptyState title="Quiet so far" message="Events appear as messes record meals and spending." />
          ) : (
            <ul className="admin-mini-feed">
              {data.activity.map((item) => (
                <li key={item.id}>
                  <span className={`activity-dot ${item.tone}`} aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.messName} · <TimeAgo iso={item.createdAt} />
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function AdminMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <article className="admin-metric">
      <div className={`admin-metric-icon ${tone}`} aria-hidden="true">
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
      </div>
      <small>{detail}</small>
    </article>
  );
}

function CheckRow({ check }: { check: AdminHealthCheck }) {
  const Icon = check.status === "ok" ? CheckCircle2 : check.status === "warn" ? AlertTriangle : XCircle;
  return (
    <li className={`check-row ${check.status}`}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </div>
      <span className="visually-hidden">
        {check.status === "ok" ? "OK" : check.status === "warn" ? "Warning" : "Problem"}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

function UsersView({ ctx }: { ctx: AdminContext }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search);
  const query = useAdminQuery<AdminPage<AdminUserRow>>(
    `/api/admin?${queryString({ view: "users", q, filter, page })}`,
    ctx.version,
  );

  return (
    <section className="admin-panel admin-directory">
      <Toolbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by name or email"
        filter={filter}
        onFilter={(value) => {
          setFilter(value);
          setPage(1);
        }}
        options={["All", "Admin", "Manager", "Member", "No mess", "Suspended"]}
      >
        {query.data && query.data.rows.length > 0 && (
          <button
            onClick={() =>
              downloadCsv("messmate-users.csv", [
                ["Name", "Email", "Role", "Mess", "Joined", "Last seen", "Suspended"],
                ...query.data!.rows.map((row) => [
                  row.name,
                  row.email,
                  row.role,
                  row.messName ?? "",
                  row.joinedAt.slice(0, 10),
                  row.lastSeenAt?.slice(0, 10) ?? "",
                  row.suspended ? "Yes" : "No",
                ]),
              ])
            }
          >
            <Download size={14} aria-hidden="true" /> Export page
          </button>
        )}
      </Toolbar>

      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading users" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="No accounts match" message="Try a different search or clear the filter." />
      ) : (
        <div className={`admin-table ${query.loading ? "is-stale" : ""}`}>
          <div className="directory-head users">
            <span>User</span>
            <span>Role</span>
            <span>Mess</span>
            <span>Last seen</span>
            <span>Status</span>
          </div>
          {query.data.rows.map((account) => (
            <button type="button" className="directory-row users clickable" key={account.id} onClick={() => setOpenId(account.id)}>
              <div>
                <Avatar name={account.name} color="#5c6ca6" size="sm" />
                <span>
                  <strong>
                    {account.name}
                    {account.isSelf && <em className="you-tag">you</em>}
                  </strong>
                  <small>{account.email}</small>
                </span>
              </div>
              <span className={`role-badge ${account.role.toLowerCase().replace(/\s+/g, "-")}`}>{account.role}</span>
              <span className="cell-ellipsis">{account.messName ?? <span className="cell-muted">—</span>}</span>
              <TimeAgo iso={account.lastSeenAt} />
              <StatusBadge status={account.suspended ? "Suspended" : "Active"} />
            </button>
          ))}
        </div>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
      {openId && <UserDrawer id={openId} ctx={ctx} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function UserDrawer({ id, ctx, onClose }: { id: string; ctx: AdminContext; onClose: () => void }) {
  const query = useAdminQuery<AdminUserDetail>(`/api/admin?view=user&id=${encodeURIComponent(id)}`, ctx.version);
  const user = query.data;
  const locked = !user || user.isSelf || user.isDemo;

  return (
    <Modal title={user?.name ?? "Account"} subtitle={user?.email} onClose={onClose} wide>
      {!user ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading account" />
      ) : (
        <div className="admin-detail">
          {user.suspended && (
            <div className="admin-callout danger">
              <Ban size={17} aria-hidden="true" />
              <p>
                <strong>Suspended.</strong> {user.suspendedReason || "No reason was recorded."}
              </p>
            </div>
          )}
          {locked && (
            <p className="muted-note">
              {user.isSelf ? "This is your own account, so account actions are disabled here." : "This is a shared demo account and cannot be changed."}
            </p>
          )}

          <dl className="admin-facts">
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>{formatDate(user.joinedAt.slice(0, 10))}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>
                <TimeAgo iso={user.lastSeenAt} />
              </dd>
            </div>
            <div>
              <dt>Signed in on</dt>
              <dd>{pluralize(user.sessions, "device")}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user.phone || "—"}</dd>
            </div>
            <div>
              <dt>Posts written</dt>
              <dd>{user.listings}</dd>
            </div>
          </dl>

          <h4 className="admin-detail-heading">Memberships</h4>
          {user.memberships.length === 0 ? (
            <p className="muted-note">This account has never belonged to a mess.</p>
          ) : (
            <ul className="admin-simple-list">
              {user.memberships.map((membership) => (
                <li key={`${membership.messId}-${membership.joinedAt}`}>
                  <span>
                    <strong>{membership.messName}</strong>
                    <small>
                      {membership.role} · joined {formatDate(membership.joinedAt.slice(0, 10))}
                      {membership.leftAt ? ` · left ${formatDate(membership.leftAt)}` : ""}
                    </small>
                  </span>
                  <StatusBadge status={membership.status} />
                </li>
              ))}
            </ul>
          )}

          {user.audit.length > 0 && (
            <>
              <h4 className="admin-detail-heading">Admin history</h4>
              <ul className="admin-simple-list">
                {user.audit.map((row) => (
                  <li key={row.id}>
                    <span>
                      <strong>{row.action}</strong>
                      <small>
                        {row.actorName} · <TimeAgo iso={row.createdAt} />
                        {row.detail ? ` · ${row.detail}` : ""}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="admin-action-grid">
            <button
              type="button"
              className="button button-outline"
              disabled={locked || ctx.busy || user.suspended}
              onClick={() =>
                ctx.confirm({
                  title: "Send a password reset link?",
                  message: `${user.email} will receive a link that lets them choose a new password. It expires in 45 minutes.`,
                  confirmLabel: "Send link",
                  onConfirm: async () => {
                    await ctx.act("sendPasswordReset", { id: user.id });
                  },
                })
              }
            >
              <KeyRound size={15} aria-hidden="true" /> Send reset link
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={locked || ctx.busy || user.sessions === 0}
              onClick={() =>
                ctx.confirm({
                  title: "Sign this account out everywhere?",
                  message: `Ends ${pluralize(user.sessions, "session")}. ${user.name} can sign straight back in.`,
                  confirmLabel: "Sign out everywhere",
                  onConfirm: async () => {
                    await ctx.act("revokeSessions", { id: user.id });
                  },
                })
              }
            >
              <LogOut size={15} aria-hidden="true" /> Sign out everywhere
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={locked || ctx.busy || (!user.role.startsWith("Admin") && user.suspended)}
              onClick={() =>
                ctx.confirm({
                  title: user.role === "Admin" ? "Remove administrator access?" : "Make this a platform administrator?",
                  message:
                    user.role === "Admin"
                      ? `${user.name} will lose access to this console and be signed out.`
                      : `${user.name} will be able to see every account and mess, and suspend them. They are signed out so the change takes effect.`,
                  confirmLabel: user.role === "Admin" ? "Remove access" : "Grant access",
                  tone: user.role === "Admin" ? "danger" : "default",
                  onConfirm: async () => {
                    await ctx.act("setAdmin", { id: user.id, admin: user.role !== "Admin" });
                  },
                })
              }
            >
              <ShieldCheck size={15} aria-hidden="true" /> {user.role === "Admin" ? "Remove admin" : "Make admin"}
            </button>
            {user.suspended ? (
              <button
                type="button"
                className="button button-dark"
                disabled={locked || ctx.busy}
                onClick={() =>
                  ctx.askReason({
                    title: `Restore ${user.name}?`,
                    message: "They will be able to sign in again straight away.",
                    confirmLabel: "Restore account",
                    placeholder: "e.g. Identity confirmed by email",
                    optional: true,
                    onSubmit: async (reason) => {
                      await ctx.act("restoreUser", { id: user.id, reason });
                    },
                  })
                }
              >
                <RotateCcw size={15} aria-hidden="true" /> Restore account
              </button>
            ) : (
              <button
                type="button"
                className="button button-danger"
                disabled={locked || ctx.busy || user.role === "Admin"}
                title={user.role === "Admin" ? "Remove administrator access first" : undefined}
                onClick={() =>
                  ctx.askReason({
                    title: `Suspend ${user.name}?`,
                    message:
                      "They are signed out everywhere and cannot sign in. Their mess and records are kept, and you can restore them at any time.",
                    confirmLabel: "Suspend account",
                    placeholder: "e.g. Posted fraudulent listings",
                    tone: "danger",
                    onSubmit: async (reason) => {
                      await ctx.act("suspendUser", { id: user.id, reason });
                    },
                  })
                }
              >
                <Ban size={15} aria-hidden="true" /> Suspend
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Messes
 * ------------------------------------------------------------------ */

function MessesView({ ctx }: { ctx: AdminContext }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search);
  const query = useAdminQuery<AdminPage<AdminMessRow>>(
    `/api/admin?${queryString({ view: "messes", q, filter, page })}`,
    ctx.version,
  );

  return (
    <section className="admin-panel admin-directory">
      <Toolbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by name, location or join code"
        filter={filter}
        onFilter={(value) => {
          setFilter(value);
          setPage(1);
        }}
        options={["All", "Active", "Setup", "Suspended"]}
      >
        {query.data && query.data.rows.length > 0 && (
          <button
            onClick={() =>
              downloadCsv("messmate-messes.csv", [
                ["Mess", "Manager", "Manager email", "Members", "Entries", "Location", "Created", "Last activity", "Status"],
                ...query.data!.rows.map((mess) => [
                  mess.name,
                  mess.manager,
                  mess.managerEmail,
                  mess.members,
                  mess.entries,
                  mess.location,
                  mess.createdAt.slice(0, 10),
                  mess.lastActivityAt?.slice(0, 10) ?? "",
                  mess.status,
                ]),
              ])
            }
          >
            <Download size={14} aria-hidden="true" /> Export page
          </button>
        )}
      </Toolbar>

      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading messes" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="No messes match" message="Try a different search or clear the filter." />
      ) : (
        <div className={`admin-table ${query.loading ? "is-stale" : ""}`}>
          <div className="directory-head messes">
            <span>Mess</span>
            <span>Manager</span>
            <span>Members</span>
            <span>Entries</span>
            <span>Last activity</span>
            <span>Status</span>
          </div>
          {query.data.rows.map((mess, index) => (
            <button type="button" className="directory-row messes clickable" key={mess.id} onClick={() => setOpenId(mess.id)}>
              <div>
                <span className={`mess-mini m${index % 4}`} aria-hidden="true">
                  {mess.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{mess.name}</strong>
                  <small>{mess.location}</small>
                </span>
              </div>
              <span className="cell-ellipsis">{mess.manager}</span>
              <strong>{mess.members}</strong>
              <span>{mess.entries.toLocaleString()}</span>
              <TimeAgo iso={mess.lastActivityAt} />
              <StatusBadge status={mess.status} />
            </button>
          ))}
        </div>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
      {openId && <MessDrawer id={openId} ctx={ctx} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function MessDrawer({ id, ctx, onClose }: { id: string; ctx: AdminContext; onClose: () => void }) {
  const query = useAdminQuery<AdminMessDetail>(`/api/admin?view=mess&id=${encodeURIComponent(id)}`, ctx.version);
  const mess = query.data;

  return (
    <Modal title={mess?.name ?? "Mess"} subtitle={mess?.location} onClose={onClose} wide>
      {!mess ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading mess" />
      ) : (
        <div className="admin-detail">
          {mess.status === "Suspended" && (
            <div className="admin-callout danger">
              <ShieldOff size={17} aria-hidden="true" />
              <p>
                <strong>Suspended — read-only for its members, and hidden from the community.</strong>{" "}
                {mess.suspendedReason}
              </p>
            </div>
          )}
          <dl className="admin-facts">
            <div>
              <dt>Owner</dt>
              <dd>{mess.manager}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(mess.createdAt.slice(0, 10))}</dd>
            </div>
            <div>
              <dt>Last activity</dt>
              <dd>
                <TimeAgo iso={mess.lastActivityAt} />
              </dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{mess.timezone.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt>Join code</dt>
              <dd>
                <code>{mess.joinCode}</code>
              </dd>
            </div>
            <div>
              <dt>Months closed</dt>
              <dd>{mess.closedMonths}</dd>
            </div>
          </dl>

          <div className="admin-count-strip">
            <span>
              <b>{mess.members}</b> active members
            </span>
            <span>
              <b>{mess.rooms}</b> rooms
            </span>
            <span>
              <b>{mess.counts.meals.toLocaleString()}</b> meal days
            </span>
            <span>
              <b>{mess.counts.bazar.toLocaleString()}</b> bazar runs
            </span>
            <span>
              <b>{mess.counts.expenses.toLocaleString()}</b> bills
            </span>
            <span>
              <b>{mess.counts.listings}</b> posts
            </span>
          </div>

          <h4 className="admin-detail-heading">People</h4>
          <ul className="admin-simple-list">
            {mess.roster.map((member) => (
              <li key={member.id}>
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {member.email} · {member.role}
                  </small>
                </span>
                <StatusBadge status={member.status} />
              </li>
            ))}
          </ul>

          {mess.activity.length > 0 && (
            <>
              <h4 className="admin-detail-heading">Recent activity</h4>
              <ul className="admin-simple-list">
                {mess.activity.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <TimeAgo iso={item.createdAt} />
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="admin-action-grid">
            {mess.status === "Suspended" ? (
              <button
                type="button"
                className="button button-dark"
                disabled={ctx.busy}
                onClick={() =>
                  ctx.askReason({
                    title: `Restore ${mess.name}?`,
                    message: "Members can make changes again, and its published posts return to the community.",
                    confirmLabel: "Restore mess",
                    placeholder: "e.g. Ownership confirmed",
                    optional: true,
                    onSubmit: async (reason) => {
                      await ctx.act("restoreMess", { id: mess.id, reason });
                    },
                  })
                }
              >
                <RotateCcw size={15} aria-hidden="true" /> Restore mess
              </button>
            ) : (
              <button
                type="button"
                className="button button-danger"
                disabled={ctx.busy}
                onClick={() =>
                  ctx.askReason({
                    title: `Suspend ${mess.name}?`,
                    message:
                      "Members can still read their records but cannot change anything, nobody new can join, and its posts disappear from the community. Nothing is deleted.",
                    confirmLabel: "Suspend mess",
                    placeholder: "e.g. Reported for fraudulent listings",
                    tone: "danger",
                    onSubmit: async (reason) => {
                      await ctx.act("suspendMess", { id: mess.id, reason });
                    },
                  })
                }
              >
                <ShieldOff size={15} aria-hidden="true" /> Suspend mess
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Listings and reports
 * ------------------------------------------------------------------ */

function ListingsView({ ctx }: { ctx: AdminContext }) {
  const [tab, setTab] = useState<"reports" | "posts">("reports");
  return (
    <>
      <div className="settings-nav admin-tabs" role="tablist" aria-label="Listing moderation">
        {(
          [
            ["reports", "Reports"],
            ["posts", "All posts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "reports" ? <ReportsPanel ctx={ctx} /> : <PostsPanel ctx={ctx} />}
    </>
  );
}

function takeDown(ctx: AdminContext, listing: { id: string; title: string }) {
  ctx.askReason({
    title: "Take this post down?",
    message: `“${listing.title}” is removed from the community at once. Its manager sees your reason and cannot republish it unless you allow it again.`,
    confirmLabel: "Take down",
    placeholder: "e.g. Asking for a deposit before a viewing",
    tone: "danger",
    onSubmit: async (reason) => {
      await ctx.act("takeDownListing", { id: listing.id, reason });
    },
  });
}

function ReportsPanel({ ctx }: { ctx: AdminContext }) {
  const [filter, setFilter] = useState("Open");
  const [page, setPage] = useState(1);
  const query = useAdminQuery<AdminPage<AdminReportRow>>(
    `/api/admin?${queryString({ view: "reports", filter, page })}`,
    ctx.version,
  );

  return (
    <section className="admin-panel admin-directory">
      <Toolbar
        filter={filter}
        onFilter={(value) => {
          setFilter(value);
          setPage(1);
        }}
        options={["Open", "Actioned", "Dismissed", "All"]}
      />
      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading reports" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={22} aria-hidden="true" />}
          title={filter === "Open" ? "No open reports" : "Nothing here"}
          message={
            filter === "Open"
              ? "Visitors can report a public post from its page. New reports appear here."
              : "Try a different filter."
          }
        />
      ) : (
        <ul className={`report-list ${query.loading ? "is-stale" : ""}`}>
          {query.data.rows.map((report) => (
            <li key={report.id} className="report-row">
              <span className={`audit-icon ${report.status === "open" ? "coral" : "blue"}`} aria-hidden="true">
                <Flag size={17} />
              </span>
              <div>
                <strong>
                  {REPORT_REASON[report.reason]} · {report.listingTitle}
                </strong>
                <p>
                  {report.messName} · <TimeAgo iso={report.createdAt} />
                  {report.contact && ` · from ${report.contact}`}
                </p>
                {report.details && <blockquote>{report.details}</blockquote>}
                {report.status !== "open" && (
                  <p className="cell-muted">
                    {report.status === "actioned" ? "Actioned" : "Dismissed"} by {report.resolvedBy}{" "}
                    {report.resolvedAt && <TimeAgo iso={report.resolvedAt} />}
                  </p>
                )}
              </div>
              <div className="report-actions">
                {report.slug && (
                  <a className="button button-outline button-tiny" href={`/community/${report.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} aria-hidden="true" /> View
                  </a>
                )}
                {report.status === "open" && (
                  <>
                    <button
                      type="button"
                      className="button button-danger button-tiny"
                      disabled={ctx.busy || !report.slug}
                      onClick={() => takeDown(ctx, { id: report.listingId, title: report.listingTitle })}
                    >
                      Take down
                    </button>
                    <button
                      type="button"
                      className="button button-outline button-tiny"
                      disabled={ctx.busy}
                      onClick={() => ctx.act("resolveReport", { id: report.id, outcome: "dismissed" })}
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
    </section>
  );
}

function PostsPanel({ ctx }: { ctx: AdminContext }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Published");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = useAdminQuery<AdminPage<AdminListingRow>>(
    `/api/admin?${queryString({ view: "listings", q, filter, page })}`,
    ctx.version,
  );

  return (
    <section className="admin-panel admin-directory">
      <Toolbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by title, address or author"
        filter={filter}
        onFilter={(value) => {
          setFilter(value);
          setPage(1);
        }}
        options={["All", "Published", "Pending", "Draft", "Reported", "Removed"]}
      />
      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading posts" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="No posts match" message="Try a different search or filter." />
      ) : (
        <div className={`admin-table ${query.loading ? "is-stale" : ""}`}>
          <div className="directory-head listings">
            <span>Post</span>
            <span>Mess</span>
            <span>Reports</span>
            <span>Updated</span>
            <span>Status</span>
            <span>
              <span className="visually-hidden">Actions</span>
            </span>
          </div>
          {query.data.rows.map((listing) => (
            <div className="directory-row listings" key={listing.id}>
              <div>
                <span>
                  <strong>{listing.title}</strong>
                  <small>
                    {listing.roomName} · by {listing.authorName || "unknown"}
                  </small>
                </span>
              </div>
              <span className="cell-ellipsis">{listing.messName}</span>
              <span className={listing.openReports ? "negative-text" : "cell-muted"}>
                {listing.openReports ? pluralize(listing.openReports, "open report") : "None"}
              </span>
              <TimeAgo iso={listing.updatedAt} />
              <StatusBadge status={listing.removedByAdmin ? "Removed" : listing.status} />
              <div className="row-actions">
                {listing.status === "published" && (
                  <a className="icon-action" href={`/community/${listing.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${listing.title}`} title="View public page">
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                )}
                {listing.removedByAdmin ? (
                  <button
                    type="button"
                    className="icon-action"
                    title={`Allow again. Removed because: ${listing.removalReason}`}
                    aria-label={`Allow ${listing.title} to be published again`}
                    disabled={ctx.busy}
                    onClick={() =>
                      ctx.confirm({
                        title: "Allow this post again?",
                        message: `It stays a draft, but its manager can publish it again. It was removed because: ${listing.removalReason || "no reason recorded"}.`,
                        confirmLabel: "Allow again",
                        onConfirm: async () => {
                          await ctx.act("allowListing", { id: listing.id });
                        },
                      })
                    }
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-action danger"
                    title="Take down"
                    aria-label={`Take down ${listing.title}`}
                    disabled={ctx.busy}
                    onClick={() => takeDown(ctx, listing)}
                  >
                    <Ban size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

/** `datetime-local` wants local wall-clock time without a zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function AnnouncementsView({ ctx }: { ctx: AdminContext }) {
  const query = useAdminQuery<{ rows: AdminAnnouncementRow[] }>("/api/admin?view=announcements", ctx.version);
  const [editing, setEditing] = useState<AdminAnnouncementRow | "new" | null>(null);

  return (
    <section className="admin-panel admin-directory">
      <div className="directory-toolbar">
        <div>
          <h3>Platform announcements</h3>
          <p>Shown as a banner at the top of every workspace while they run.</p>
        </div>
        <div>
          <button type="button" className="button button-dark button-tiny" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" /> New announcement
          </button>
        </div>
      </div>
      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading announcements" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={22} aria-hidden="true" />}
          title="No announcements"
          message="Use one for planned maintenance, a new feature, or anything every mess should know."
        />
      ) : (
        <ul className="announcement-admin-list">
          {query.data.rows.map((row) => (
            <li key={row.id} className={`announcement-admin-row ${row.tone}`}>
              <div>
                <span className="announcement-meta">
                  <StatusBadge status={row.state} />
                  <span>
                    {row.audience === "managers" ? "Managers only" : "Everyone"} ·{" "}
                    {row.state === "scheduled" ? "starts" : "started"} {new Date(row.startsAt).toLocaleString()}
                    {row.endsAt && ` · ${row.state === "ended" ? "ended" : "ends"} ${new Date(row.endsAt).toLocaleString()}`}
                  </span>
                </span>
                <strong>{row.title}</strong>
                {row.body && <p>{row.body}</p>}
                <small className="cell-muted">By {row.createdBy}</small>
              </div>
              <div className="row-actions">
                <button type="button" className="button button-outline button-tiny" onClick={() => setEditing(row)}>
                  Edit
                </button>
                {row.state !== "ended" && (
                  <button
                    type="button"
                    className="button button-outline button-tiny"
                    disabled={ctx.busy}
                    onClick={() => ctx.act("endAnnouncement", { id: row.id })}
                  >
                    End now
                  </button>
                )}
                <button
                  type="button"
                  className="icon-action danger"
                  aria-label={`Delete ${row.title}`}
                  disabled={ctx.busy}
                  onClick={() =>
                    ctx.confirm({
                      title: "Delete this announcement?",
                      message: "It disappears from every workspace and from this list.",
                      confirmLabel: "Delete",
                      tone: "danger",
                      onConfirm: async () => {
                        await ctx.act("deleteAnnouncement", { id: row.id });
                      },
                    })
                  }
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <AnnouncementForm
          initial={editing === "new" ? null : editing}
          ctx={ctx}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function AnnouncementForm({
  initial,
  ctx,
  onClose,
}: {
  initial: AdminAnnouncementRow | null;
  ctx: AdminContext;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    tone: (initial?.tone ?? "info") as AnnouncementTone,
    audience: (initial?.audience ?? "everyone") as AnnouncementAudience,
    startsAt: toLocalInput(initial?.startsAt ?? null),
    endsAt: toLocalInput(initial?.endsAt ?? null),
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await ctx.act("saveAnnouncement", {
      id: initial?.id,
      ...form,
      // Sent as absolute instants, so the server's own timezone never matters.
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    });
    if (ok) onClose();
  };

  return (
    <Modal
      title={initial ? "Edit announcement" : "New announcement"}
      subtitle="Keep it short: it sits above every page of the workspace."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Headline
          <input
            autoFocus
            required
            maxLength={120}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="e.g. Scheduled maintenance on Friday 2–3 am"
          />
        </label>
        <label>
          Details (optional)
          <textarea
            rows={3}
            maxLength={600}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            placeholder="What people need to know or do."
          />
        </label>
        <div className="form-grid">
          <label>
            Style
            <select value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value as AnnouncementTone })}>
              <option value="info">Information</option>
              <option value="warning">Warning</option>
              <option value="success">Good news</option>
            </select>
          </label>
          <label>
            Who sees it
            <select
              value={form.audience}
              onChange={(event) => setForm({ ...form, audience: event.target.value as AnnouncementAudience })}
            >
              <option value="everyone">Everyone</option>
              <option value="managers">Managers only</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Starts
            <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </label>
          <label>
            Ends (optional)
            <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          </label>
        </div>
        <p className="muted-note">Leave “Starts” empty to show it now, and “Ends” empty to run it until you end it.</p>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={ctx.busy} busyLabel="Saving…" type="submit" disabled={!form.title.trim()}>
            {initial ? "Save changes" : "Publish"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Activity, audit and health
 * ------------------------------------------------------------------ */

function ActivityView({ version }: { version: number }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = useAdminQuery<AdminPage<AdminActivityRow>>(`/api/admin?${queryString({ view: "activity", q, page })}`, version);
  return (
    <section className="admin-panel audit-panel">
      <Toolbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search events"
      />
      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading activity" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState title="No activity" message="Events appear here as messes record meals and spending." />
      ) : (
        <ul className={query.loading ? "is-stale" : ""}>
          {query.data.rows.map((item) => {
            const Icon = item.tone === "green" ? Building2 : item.tone === "coral" ? ShieldAlert : Activity;
            return (
              <li className="audit-row" key={item.id}>
                <span className={`audit-icon ${item.tone}`} aria-hidden="true">
                  <Icon size={17} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.messName} · {item.detail}
                  </p>
                </div>
                <TimeAgo iso={item.createdAt} />
              </li>
            );
          })}
        </ul>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
    </section>
  );
}

function AuditView({ version }: { version: number }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const query = useAdminQuery<AdminPage<AdminAuditRow>>(`/api/admin?${queryString({ view: "audit", q, page })}`, version);
  return (
    <section className="admin-panel audit-panel">
      <Toolbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by admin, action or target"
      >
        {query.data && query.data.rows.length > 0 && (
          <button
            onClick={() =>
              downloadCsv("messmate-admin-audit.csv", [
                ["When", "Administrator", "Action", "Target", "Detail"],
                ...query.data!.rows.map((row) => [row.createdAt, row.actorName, row.action, row.targetLabel, row.detail]),
              ])
            }
          >
            <Download size={14} aria-hidden="true" /> Export page
          </button>
        )}
      </Toolbar>
      {!query.data ? (
        <LoadState error={query.error} onRetry={query.reload} label="Loading audit log" />
      ) : query.data.rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} aria-hidden="true" />}
          title="Nothing recorded yet"
          message="Suspensions, takedowns, access changes and announcements are logged here."
        />
      ) : (
        <ul className={query.loading ? "is-stale" : ""}>
          {query.data.rows.map((row) => (
            <li className="audit-row" key={row.id}>
              <span className="audit-icon blue" aria-hidden="true">
                <ShieldCheck size={17} />
              </span>
              <div>
                <strong>
                  {row.action} · {row.targetLabel}
                </strong>
                <p>
                  by {row.actorName}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </div>
              <TimeAgo iso={row.createdAt} />
            </li>
          ))}
        </ul>
      )}
      {query.data && <Pager page={query.data} onPage={setPage} />}
    </section>
  );
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function HealthView({ version }: { version: number }) {
  const query = useAdminQuery<AdminHealth>("/api/admin?view=health", version);
  const health = query.data;
  if (!health) return <LoadState error={query.error} onRetry={query.reload} label="Running checks" />;
  const problems = health.checks.filter((check) => check.status === "error").length;
  const warnings = health.checks.filter((check) => check.status === "warn").length;

  return (
    <div className="health-detail-grid">
      <section className={`admin-panel health-hero ${problems ? "has-problems" : ""}`}>
        <span className="health-hero-icon" aria-hidden="true">
          <HeartPulse size={28} />
        </span>
        <div>
          <span>CURRENT STATUS</span>
          <h2>
            {problems
              ? `${pluralize(problems, "problem")} to fix before going live`
              : warnings
                ? `Running, with ${pluralize(warnings, "warning")}`
                : "Everything checks out"}
          </h2>
          <p>
            Checked <span suppressHydrationWarning>{relativeTime(health.generatedAt)}</span> ·{" "}
            {health.runtime.environment}
          </p>
        </div>
        <strong>
          {health.database.latencyMs} ms<small>database ping</small>
        </strong>
      </section>

      <section className="admin-panel health-checks">
        <div className="admin-panel-head">
          <div>
            <span>CONFIGURATION</span>
            <h3>Deployment checklist</h3>
          </div>
        </div>
        <ul className="check-list">
          {health.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      </section>

      <section className="admin-panel health-service">
        <div>
          <span className="health-service-icon" aria-hidden="true">
            <Database size={19} />
          </span>
          <span>
            <strong>MongoDB · {health.database.name}</strong>
            <small>
              {formatBytes(health.database.dataSizeBytes)} of data · {formatBytes(health.database.storageSizeBytes)} on disk
            </small>
          </span>
        </div>
        <ul className="collection-counts">
          {health.database.collections.map((collection) => (
            <li key={collection.name}>
              <span>{collection.name}</span>
              <b>{collection.documents.toLocaleString()}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-panel health-service">
        <div>
          <span className="health-service-icon" aria-hidden="true">
            <ServerCog size={19} />
          </span>
          <span>
            <strong>Application server</strong>
            <small>This instance only</small>
          </span>
        </div>
        <ul className="collection-counts">
          <li>
            <span>Node.js</span>
            <b>{health.runtime.node}</b>
          </li>
          <li>
            <span>Uptime</span>
            <b>{formatUptime(health.runtime.uptimeSeconds)}</b>
          </li>
          <li>
            <span>Memory in use</span>
            <b>{health.runtime.memoryMb} MB</b>
          </li>
          <li>
            <span>Liveness endpoint</span>
            <b>
              <a href="/api/health" target="_blank" rel="noreferrer">
                /api/health
              </a>
            </b>
          </li>
        </ul>
      </section>
    </div>
  );
}
