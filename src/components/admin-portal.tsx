"use client";

import {
  Activity,
  BarChart3,
  Building2,
  Database,
  Download,
  Gauge,
  HeartPulse,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PresencePing } from "@/components/presence-ping";
import { useCallback, useEffect, useState } from "react";
import { downloadCsv, formatDate, formatMoney, relativeTime } from "@/lib/format";
import type { AdminData } from "@/lib/types";
import { Avatar, EmptyState, Spinner } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";

type AdminView = "overview" | "messes" | "users" | "activity" | "health";

const ADMIN_NAV: { id: AdminView; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "Platform overview", icon: Gauge },
  { id: "messes", label: "Messes", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "activity", label: "Activity log", icon: Activity },
  { id: "health", label: "System health", icon: HeartPulse },
];

const TITLES: Record<AdminView, [string, string]> = {
  overview: ["Platform overview", "Live counts from the application database."],
  messes: ["Mess directory", "Every mess on this deployment."],
  users: ["User directory", "Accounts, roles and mess membership."],
  activity: ["Activity log", "Workspace events recorded across all messes."],
  health: ["System health", "Connectivity and response times right now."],
};

export function AdminPortal({ userName }: { userName: string }) {
  const router = useRouter();
  const [view, setView] = useState<AdminView>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  // Starts true because the first load begins as soon as the page mounts.
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    requestJson<AdminData>("/api/admin")
      .then((next) => {
        if (!active) return;
        setData(next);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Platform data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const load = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  const openView = (next: AdminView) => {
    setView(next);
    setDrawerOpen(false);
  };

  const signOut = async () => {
    try {
      await requestJson<{ ok: boolean }>("/api/auth", { action: "signout" });
    } catch {
      // The redirect below still ends the session on this device.
    }
    router.replace("/signin");
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
          <Link className="admin-brand" href="/" aria-label="MessMate home">
            <span className="brand-mark" aria-hidden="true">
              <ShieldCheck size={21} />
            </span>
            <span>
              <strong>MessMate</strong>
              <small>Platform administration</small>
            </span>
          </Link>
          <button
            className="drawer-close icon-button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav>
          <span className="nav-label">ADMIN CONSOLE</span>
          <ul>
            {ADMIN_NAV.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  className={view === id ? "active" : ""}
                  aria-current={view === id ? "page" : undefined}
                  onClick={() => openView(id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-bottom">
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
            <button
              className="admin-menu icon-button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div>
              <h1>{heading}</h1>
              <p>{subtitle}</p>
            </div>
          </div>
          <div className="top-actions">
            <label className="admin-search">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Search the platform</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search messes or users"
              />
            </label>
            <Avatar name={userName} color="#5c6ca6" />
          </div>
        </header>

        <main id="admin-content" className="admin-content">
          <div className="admin-page-actions">
            <div>
              <span className="admin-live">
                <i aria-hidden="true" /> Live platform data
              </span>
              {data && <span suppressHydrationWarning>Updated {relativeTime(data.generatedAt)}</span>}
            </div>
            <div>
              <button onClick={load} disabled={loading}>
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
              {data && (
                <button
                  onClick={() =>
                    downloadCsv("messmate-platform-summary.csv", [
                      ["Metric", "Value"],
                      ["Registered users", data.stats.users],
                      ["Online now", data.stats.onlineNow],
                      ["Active today", data.stats.activeDay],
                      ["Active this week", data.stats.activeWeek],
                      ["Active this month", data.stats.activeMonth],
                      ["Activity figures complete", data.stats.activityPartial ? "No" : "Yes"],
                      ["Messes", data.stats.messes],
                      ["Active messes", data.stats.activeMesses],
                      ["Meal entries", data.stats.meals],
                      ["Bazar entries", data.stats.bazar],
                      ["Rooms", data.stats.rooms],
                      ["Expense volume", data.stats.expenseVolume],
                      ["Generated at", data.generatedAt],
                    ])
                  }
                >
                  <Download size={15} aria-hidden="true" /> Export summary
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="admin-panel">
              <EmptyState
                icon={<ShieldAlert size={22} aria-hidden="true" />}
                title="Could not load platform data"
                message={error}
                action={
                  <button className="button button-dark" onClick={load}>
                    Try again
                  </button>
                }
              />
            </div>
          )}

          {!data && !error && (
            <div className="admin-panel loading-panel">
              <Spinner label="Loading platform data" /> Loading platform data&hellip;
            </div>
          )}

          {data && view === "overview" && <AdminOverview data={data} onNavigate={openView} />}
          {data && view !== "overview" && <AdminDetail view={view} search={search} data={data} />}
        </main>
      </div>
    </div>
  );
}

function AdminOverview({
  data,
  onNavigate,
}: {
  data: AdminData;
  onNavigate: (view: AdminView) => void;
}) {
  const maxSignups = Math.max(...data.signups.map((point) => point.users), 1);
  const newThisMonth = data.signups[data.signups.length - 1]?.users ?? 0;

  return (
    <>
      <section className="admin-metrics">
        <AdminMetric label="Registered users" value={data.stats.users.toLocaleString()} detail="Accounts in the database" icon={Users} tone="violet" />
        <AdminMetric
          label="Active this week"
          value={data.stats.activeWeek.toLocaleString()}
          detail={`${data.stats.activeDay.toLocaleString()} today · ${data.stats.activeMonth.toLocaleString()} this month`}
          icon={UserCheck}
          tone="green"
        />
        <AdminMetric
          label="Online now"
          value={data.stats.onlineNow.toLocaleString()}
          detail="Tabs open and being looked at"
          icon={Radio}
          tone="coral"
        />
        <AdminMetric label="Expense volume" value={formatMoney(data.stats.expenseVolume)} detail="Recorded across all messes" icon={BarChart3} tone="blue" />
      </section>

      {data.stats.activityPartial && (
        <p className="admin-stat-note">
          Activity is counted from each account&apos;s last visit, which is only recorded from the
          moment this dashboard started tracking it. Accounts that have not signed in since are
          not counted yet, so these figures will rise over the first few weeks.
        </p>
      )}

      <section className="admin-metrics">
        <AdminMetric label="Messes" value={data.stats.messes.toLocaleString()} detail={`${data.stats.activeMesses} with active members`} icon={Building2} tone="blue" />
        <AdminMetric label="Meal entries" value={data.stats.meals.toLocaleString()} detail="All time" icon={Activity} tone="violet" />
        <AdminMetric label="Bazar entries" value={data.stats.bazar.toLocaleString()} detail="All time" icon={Activity} tone="green" />
        <AdminMetric label="Rooms" value={data.stats.rooms.toLocaleString()} detail="Configured across all messes" icon={Building2} tone="coral" />
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
                  <small>{row.count.toLocaleString()} records</small>
                </span>
                <div>
                  <i
                    className={["coral", "green", "blue", "violet"][index % 4]}
                    style={{ width: `${Math.min(100, row.share)}%` }}
                  />
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
          {data.messes.length === 0 ? (
            <EmptyState title="No messes yet" message="Messes appear here once someone creates one." />
          ) : (
            <div className="admin-table">
              <div className="admin-table-head">
                <span>Mess</span>
                <span>Manager</span>
                <span>Members</span>
                <span>Location</span>
                <span>Status</span>
              </div>
              {data.messes.slice(0, 5).map((mess, index) => (
                <div className="admin-table-row" key={mess.id}>
                  <div>
                    <span className={`mess-mini m${index % 4}`} aria-hidden="true">
                      {mess.name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{mess.name}</strong>
                  </div>
                  <span>{mess.manager}</span>
                  <span>{mess.members}</span>
                  <span>{mess.location}</span>
                  <span className={`admin-status ${mess.status.toLowerCase()}`}>{mess.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <ServiceHealth data={data} />
      </div>
    </>
  );
}

function ServiceHealth({ data }: { data: AdminData }) {
  const rows: [string, string, string][] = [
    ["Application API", "Responding", "This request"],
    ["MongoDB", "Connected", `${data.databaseLatency} ms ping`],
    ["Session store", "Connected", "MongoDB, 30-day TTL"],
    ["Route handlers", "Responding", "Next.js 16, Node runtime"],
  ];
  return (
    <section className="admin-panel health-summary">
      <div className="admin-panel-head">
        <div>
          <span>SYSTEM STATUS</span>
          <h3>Service health</h3>
        </div>
        <span className="all-operational">
          <i aria-hidden="true" /> Operational
        </span>
      </div>
      <ul className="health-list">
        {rows.map(([name, status, detail]) => (
          <li key={name}>
            <span>
              <i aria-hidden="true" />
              <strong>{name}</strong>
            </span>
            <span>
              <b>{status}</b>
              <small>{detail}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="health-note">
        Checked when this page loaded. MessMate does not poll services in the background.
      </p>
    </section>
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

function AdminDetail({
  view,
  search,
  data,
}: {
  view: Exclude<AdminView, "overview">;
  search: string;
  data: AdminData;
}) {
  const [localSearch, setLocalSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const query = `${search} ${localSearch}`.trim().toLowerCase();

  if (view === "messes") {
    const rows = data.messes.filter(
      (mess) =>
        (!query || `${mess.name} ${mess.manager} ${mess.location}`.toLowerCase().includes(query)) &&
        (filter === "All" || mess.status === filter),
    );
    return (
      <section className="admin-panel admin-directory">
        <DirectoryToolbar
          placeholder="Search by mess, manager or location"
          value={localSearch}
          onChange={setLocalSearch}
          filter={filter}
          onFilter={setFilter}
          options={["All", "Active", "Setup"]}
          onExport={() =>
            downloadCsv("messmate-messes.csv", [
              ["Mess", "Manager", "Members", "Entries", "Location", "Created", "Status"],
              ...rows.map((mess) => [
                mess.name,
                mess.manager,
                mess.members,
                mess.entries,
                mess.location,
                mess.createdAt.slice(0, 10),
                mess.status,
              ]),
            ])
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Nothing matches" message="Try a different search or clear the filter." />
        ) : (
          <div className="admin-table">
            <div className="directory-head messes">
              <span>Mess</span>
              <span>Manager</span>
              <span>Members</span>
              <span>Entries</span>
              <span>Created</span>
              <span>Status</span>
            </div>
            {rows.map((mess, index) => (
              <div className="directory-row messes" key={mess.id}>
                <div>
                  <span className={`mess-mini m${index % 4}`} aria-hidden="true">
                    {mess.name.slice(0, 2).toUpperCase()}
                  </span>
                  <strong>{mess.name}</strong>
                </div>
                <span>{mess.manager}</span>
                <strong>{mess.members}</strong>
                <span>{mess.entries}</span>
                <span>{formatDate(mess.createdAt.slice(0, 10))}</span>
                <span className={`admin-status ${mess.status.toLowerCase()}`}>{mess.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (view === "users") {
    const rows = data.users.filter(
      (account) =>
        (!query || `${account.name} ${account.email}`.toLowerCase().includes(query)) &&
        (filter === "All" || account.role === filter),
    );
    return (
      <section className="admin-panel admin-directory">
        <DirectoryToolbar
          placeholder="Search users by name or email"
          value={localSearch}
          onChange={setLocalSearch}
          filter={filter}
          onFilter={setFilter}
          options={["All", "Admin", "Manager", "Member"]}
          onExport={() =>
            downloadCsv("messmate-users.csv", [
              ["Name", "Email", "Role", "Messes", "Joined"],
              ...rows.map((account) => [
                account.name,
                account.email,
                account.role,
                account.messes,
                account.joinedAt.slice(0, 10),
              ]),
            ])
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Nothing matches" message="Try a different search or clear the filter." />
        ) : (
          <div className="admin-table">
            <div className="directory-head users">
              <span>User</span>
              <span>Role</span>
              <span>Messes</span>
              <span>Joined</span>
            </div>
            {rows.map((account) => (
              <div className="directory-row users" key={account.id}>
                <div>
                  <Avatar name={account.name} color="#5c6ca6" size="sm" />
                  <span>
                    <strong>{account.name}</strong>
                    <small>{account.email}</small>
                  </span>
                </div>
                <span className={`role-badge ${account.role.toLowerCase()}`}>{account.role}</span>
                <strong>{account.messes}</strong>
                <span>{formatDate(account.joinedAt.slice(0, 10), { month: "short", year: "numeric" })}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (view === "activity") {
    const rows = data.activity.filter(
      (item) => !query || `${item.title} ${item.detail}`.toLowerCase().includes(query),
    );
    return (
      <section className="admin-panel audit-panel">
        <div className="directory-toolbar">
          <div>
            <h3>Activity log</h3>
            <p>The 50 most recent workspace events</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No activity" message="Events appear here as messes record meals and spending." />
        ) : (
          <ul>
            {rows.map((item) => {
              const Icon = item.tone === "green" ? Building2 : item.tone === "coral" ? ShieldAlert : Activity;
              return (
                <li className="audit-row" key={item.id}>
                  <span className={`audit-icon ${item.tone}`} aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <time dateTime={item.createdAt} suppressHydrationWarning>
                    {relativeTime(item.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="health-detail-grid">
      <section className="admin-panel health-hero">
        <span className="health-hero-icon" aria-hidden="true">
          <HeartPulse size={28} />
        </span>
        <div>
          <span>CURRENT STATUS</span>
          <h2>Core systems responding</h2>
          <p>The API and the database both answered the request that built this page.</p>
        </div>
        <strong>
          {data.databaseLatency} ms<small>database ping</small>
        </strong>
      </section>
      {(
        [
          ["Application API", "Responding", "This request", ServerCog],
          ["MongoDB", "Connected", `${data.databaseLatency} ms`, Database],
          ["Authentication", "Active", "HttpOnly session cookie", ShieldCheck],
          ["Data exports", "Available", "Generated in the browser", Download],
        ] as const
      ).map(([name, status, detail, Icon]) => (
        <section className="admin-panel health-service" key={name}>
          <div>
            <span className="health-service-icon" aria-hidden="true">
              <Icon size={19} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>
                <i aria-hidden="true" /> {status}
              </small>
            </span>
          </div>
          <div>
            <span>
              <small>Detail</small>
              <b>{detail}</b>
            </span>
          </div>
        </section>
      ))}
    </div>
  );
}

function DirectoryToolbar({
  placeholder,
  value,
  onChange,
  filter,
  onFilter,
  options,
  onExport,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
  options: string[];
  onExport: () => void;
}) {
  return (
    <div className="directory-toolbar">
      <label className="admin-filter-search">
        <Search size={15} aria-hidden="true" />
        <span className="visually-hidden">{placeholder}</span>
        <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </label>
      <div>
        <label>
          <span className="visually-hidden">Filter</span>
          <select value={filter} onChange={(event) => onFilter(event.target.value)}>
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button onClick={onExport}>
          <Download size={14} aria-hidden="true" /> Export
        </button>
      </div>
    </div>
  );
}
