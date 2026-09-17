"use client";

import {
  Bell,
  CalendarDays,
  Check,
  Compass,
  CookingPot,
  Gauge,
  Home,
  LogOut,
  Menu,
  MoreHorizontal,
  ReceiptText,
  Settings,
  ShieldAlert,
  ShoppingBasket,
  Sparkles,
  Users,
  Utensils,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatDate, initialsOf, relativeTime } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { WorkspaceData } from "@/lib/types";
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  Modal,
  type ConfirmRequest,
} from "@/components/ui";
import {
  requestJson,
  useWorkspace,
  WorkspaceProvider,
  type Panel,
  type Toast,
} from "@/components/workspace-context";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  managerOnly?: boolean;
  mobile?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: Gauge, mobile: true },
  { href: "/meals", label: "Meals", icon: Utensils, mobile: true },
  { href: "/bazar", label: "Bazar", icon: ShoppingBasket, mobile: true },
  { href: "/expenses", label: "Expenses", icon: ReceiptText, mobile: true },
  { href: "/house", label: "House", icon: Home },
  { href: "/members", label: "Members", icon: Users },
];

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/meals": { title: "Meal planner", subtitle: "Plan ahead and keep the kitchen count accurate." },
  "/bazar": { title: "Bazar & groceries", subtitle: "Track purchases, receipts and the duty roster." },
  "/expenses": { title: "Expenses", subtitle: "See where every taka goes and how it is shared." },
  "/house": { title: "The house", subtitle: "Address, rooms, facilities and what you advertise." },
  "/members": { title: "Members", subtitle: "Invite people and keep every balance transparent." },
  "/settings": { title: "Mess settings", subtitle: "Set the rules once and MessMate applies them for everyone." },
};

export function WorkspaceShell({
  initialData,
  children,
}: {
  initialData: WorkspaceData;
  children: ReactNode;
}) {
  return (
    <WorkspaceProvider initialData={initialData} renderOverlays={(state) => <Overlays {...state} />}>
      <ShellChrome>{children}</ShellChrome>
    </WorkspaceProvider>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  const { data, isManager, openPanel } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { workspace } = data;
  // Navigation closes the drawer at the click, rather than reacting to the
  // route afterwards, so there is no extra render between the two.
  const closeDrawer = () => setDrawerOpen(false);

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
      // The redirect below still ends the session on this device.
    }
    router.replace("/signin");
  };

  const pendingBazar = data.bazar.filter((entry) => entry.status === "Pending").length;
  const joinRequests = data.members.filter((member) => member.status === "requested").length;
  const badgeFor = (href: string) =>
    href === "/bazar" ? pendingBazar : href === "/members" && isManager ? joinRequests : 0;
  const visibleNav = navItems.filter((item) => !item.managerOnly || isManager);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <button
        className={`sidebar-overlay ${drawerOpen ? "show" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
      />

      <aside className={`sidebar ${drawerOpen ? "open" : ""}`} aria-label="Main navigation">
        <div className="sidebar-top">
          <Link className="brand" href="/" aria-label="MessMate home">
            <span className="brand-mark" aria-hidden="true">
              <CookingPot size={22} />
            </span>
            <span>
              <strong>MessMate</strong>
              <small>Shared living, sorted.</small>
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

        <div className="mess-switcher">
          <span className="house-avatar" aria-hidden="true">
            {initialsOf(workspace.messName)}
          </span>
          <span className="mess-switcher-text">
            <small>YOUR MESS</small>
            <strong title={workspace.messName}>{workspace.messName}</strong>
          </span>
        </div>

        <nav>
          <span className="nav-label" id="nav-workspace">
            WORKSPACE
          </span>
          <ul aria-labelledby="nav-workspace">
            {visibleNav.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    onClick={closeDrawer}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {badgeFor(href) > 0 && (
                      <i aria-label={`${badgeFor(href)} awaiting attention`}>{badgeFor(href)}</i>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {isManager && (
            <>
              <span className="nav-label second" id="nav-management">
                MANAGEMENT
              </span>
              <ul aria-labelledby="nav-management">
                <li>
                  <Link
                    href="/settings"
                    className={pathname === "/settings" ? "active" : ""}
                    aria-current={pathname === "/settings" ? "page" : undefined}
                    onClick={closeDrawer}
                  >
                    <Settings size={18} aria-hidden="true" />
                    <span>Mess settings</span>
                  </Link>
                </li>
              </ul>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <Link className="sidebar-external" href="/community">
            <Compass size={17} aria-hidden="true" />
            <span>
              <strong>Find a room</strong>
              <small>Browse rooms to let</small>
            </span>
          </Link>
          <div className="help-card">
            <span aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <strong>Need a hand?</strong>
            <p>A two-minute guide to running the month.</p>
            <button type="button" onClick={() => openPanel("help")}>
              Open the guide
            </button>
          </div>
          <div className="profile-row">
            <Link className="profile-identity" href="/profile" onClick={closeDrawer}>
              <Avatar
                name={workspace.userName}
                color="#c9603f"
                size="sm"
                avatarId={workspace.userAvatarId}
              />
              <span>
                <strong>{workspace.userName}</strong>
                <small>{isManager ? "Mess manager" : "Mess member"}</small>
              </span>
            </Link>
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <TopBar onOpenDrawer={() => setDrawerOpen(true)} />
        <main id="main-content" className="page-content">
          {children}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Sections">
        {navItems
          .filter((item) => item.mobile)
          .map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={closeDrawer}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                {badgeFor(href) > 0 && <i aria-hidden="true" />}
              </Link>
            );
          })}
        <button type="button" onClick={() => setDrawerOpen(true)}>
          <MoreHorizontal size={19} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

function TopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { data, openPanel, setPeriod, switchingPeriod } = useWorkspace();
  const pathname = usePathname();
  // Sub-routes such as /house/rooms belong to their section's heading, so the
  // longest matching prefix wins rather than an exact match.
  const meta =
    pageMeta[pathname] ??
    pageMeta[
      Object.keys(pageMeta)
        .filter((key) => pathname.startsWith(`${key}/`))
        .sort((a, b) => b.length - a.length)[0]
    ];
  const title = meta?.title ?? `${greetingFor(data.workspace.userName)}`;
  const subtitle = meta?.subtitle ?? `Here is what is happening at ${data.workspace.messName}.`;

  return (
    <header className="topbar">
      <div className="headline-wrap">
        <button className="mobile-menu icon-button" onClick={onOpenDrawer} aria-label="Open navigation">
          <Menu size={21} aria-hidden="true" />
        </button>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="top-actions">
        <label className="month-picker">
          <CalendarDays size={17} aria-hidden="true" />
          <span className="visually-hidden">Settlement month</span>
          <select
            value={data.period}
            onChange={(event) => setPeriod(event.target.value)}
            disabled={switchingPeriod}
          >
            {data.periods.map((period) => (
              <option key={period} value={period}>
                {periodLabel(period)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button notification"
          onClick={() => openPanel("notifications")}
          aria-label={`Notifications, ${data.activity.length} recent`}
        >
          <Bell size={19} aria-hidden="true" />
          {data.activity.length > 0 && <i aria-hidden="true" />}
        </button>
        <Link href="/profile" className="topbar-identity" aria-label="Your profile">
          <Avatar
            name={data.workspace.userName}
            color="#c9603f"
            avatarId={data.workspace.userAvatarId}
          />
        </Link>
      </div>
    </header>
  );
}

function greetingFor(name: string) {
  const hour = new Date().getHours();
  const part = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}

function Overlays({
  panel,
  openPanel,
  confirmRequest,
  closeConfirm,
  toasts,
  dismissToast,
}: {
  panel: Panel;
  openPanel: (panel: Panel) => void;
  confirmRequest: ConfirmRequest | null;
  closeConfirm: () => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}) {
  const { data } = useWorkspace();
  return (
    <>
      {panel === "notifications" && (
        <Modal
          title="Recent activity"
          subtitle="Everything that happened in your mess, newest first."
          onClose={() => openPanel(null)}
        >
          {data.activity.length === 0 ? (
            <EmptyState
              icon={<Bell size={22} aria-hidden="true" />}
              title="Nothing yet"
              message="Meals, bazar runs and expenses will show up here as they happen."
            />
          ) : (
            <ul className="activity-list modal-activity">
              {data.activity.map((item) => (
                <li className="activity-item" key={item.id}>
                  <span className={`activity-dot ${item.tone}`} aria-hidden="true">
                    <Check size={12} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <time
                    dateTime={item.createdAt}
                    title={formatDate(item.createdAt.slice(0, 10))}
                    suppressHydrationWarning
                  >
                    {relativeTime(item.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {panel === "help" && (
        <Modal
          title="How a month works"
          subtitle="Four steps from the first meal to a settled month."
          onClose={() => openPanel(null)}
        >
          <ol className="help-list">
            <li>
              <strong>1. Everyone records their meals</strong>
              <span>
                Each member sets their own breakfast, lunch and dinner count. Entries for today
                close at {data.settings.cutoff}; future days stay open.
              </span>
            </li>
            <li>
              <strong>2. Whoever shops adds the bazar</strong>
              <span>
                Add the items and the total, with a receipt photo if your mess requires one. A
                manager approves it, and the amount counts towards the shared food pot.
              </span>
            </li>
            <li>
              <strong>3. The manager records shared bills</strong>
              <span>
                Rent, electricity and maintenance are split equally or by room rent, and credited to
                whoever actually paid.
              </span>
            </li>
            <li>
              <strong>4. MessMate works out the meal rate</strong>
              <span>
                Approved bazar divided by everyone&rsquo;s meals gives the rate. Overview shows who
                owes what, and Expenses lists the exact payments that close the month.
              </span>
            </li>
          </ol>
          <p className="help-footer">
            <Link href="/settings">Mess settings</Link> controls cutoffs, approvals and the roster.
          </p>
        </Modal>
      )}

      {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={closeConfirm} />}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`app-toast ${toast.tone}`} role="status">
            {toast.tone === "success" ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <ShieldAlert size={16} aria-hidden="true" />
            )}
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
