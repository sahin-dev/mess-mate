"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CookingPot,
  Handshake,
  Home,
  Megaphone,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  UserPlus,
  Utensils,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatMoney, pluralize, relativeTime } from "@/lib/format";
import { daysLeftInPeriod, periodLabel } from "@/lib/period";
import { cutoffHasPassed, periodInZone, todayInZone } from "@/lib/timezone";
import type { Expense, MealEntry, MealKey, Member, WorkspaceData } from "@/lib/types";
import { ActionButton, Avatar, EmptyState } from "@/components/ui";
import { usePeriodHref, useWorkspace } from "@/components/workspace-context";

const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_META: Record<MealKey, { label: string; symbol: string }> = {
  breakfast: { label: "Breakfast", symbol: "☕" },
  lunch: { label: "Lunch", symbol: "◒" },
  dinner: { label: "Dinner", symbol: "☾" },
};

export function OverviewView({ onAddExpense }: { onAddExpense: () => void }) {
  const { data, isManager } = useWorkspace();
  const periodHref = usePeriodHref();
  const { settlement, workspace } = data;

  const activeMembers = data.members.filter((member) => member.status === "active");
  const me = data.members.find((member) => member.id === workspace.userId);
  const personalSpend = getPersonalSpend(data, me);
  const timeZone = data.settings.timezone;
  const [loadedAt] = useState(() => Date.now());
  const isCurrentPeriod = data.period === periodInZone(timeZone);
  const daysLeft = daysLeftInPeriod(data.period, timeZone);
  const pending = data.bazar.filter((entry) => entry.status === "Pending");
  const joinRequests = data.members.filter((member) => member.status === "requested");
  const pendingListings = data.listings.filter((listing) => listing.status === "pending");
  const pendingMeals = Object.values(data.memberMeals)
    .flat()
    .filter((entry) => entry.status === "Pending");
  const ownPending = pending.filter((entry) => entry.memberId === workspace.userId);
  const today = todayInZone(timeZone);
  const hasTodayEntry = data.meals.some((entry) => entry.date === today);
  const canEditToday =
    isManager ||
    data.settings.allowAnytime ||
    !cutoffHasPassed(timeZone, data.settings.cutoff, new Date(loadedAt));
  const attentionCount = pending.length + pendingMeals.length + joinRequests.length + pendingListings.length;
  const attentionHref = pendingMeals.length
    ? "/meals"
    : pending.length
    ? "/bazar"
    : joinRequests.length
      ? "/members"
      : pendingListings.length
        ? "/house/listings"
        : undefined;

  // A brand-new mess has nothing to show, so send the manager through setup
  // instead of a dashboard full of zeros.
  const setupTasks = [
    { done: data.rooms.length > 0, label: "Add your rooms and rent", href: "/house/rooms" },
    { done: activeMembers.length > 1, label: "Invite your housemates", href: "/members" },
    { done: data.bazar.length > 0, label: "Record the first bazar run", href: "/bazar" },
    { done: data.expenses.length > 0, label: "Add a shared bill", href: "/expenses" },
  ];
  const showSetup = isManager && isCurrentPeriod && setupTasks.some((task) => !task.done);

  return (
    <>
      <PeriodStrip
        daysLeft={daysLeft}
        isCurrentPeriod={isCurrentPeriod}
        isManager={isManager}
        hasTodayEntry={hasTodayEntry}
        canEditToday={canEditToday}
        ownPendingCount={ownPending.length}
        pendingBazarCount={pending.length}
        pendingMealCount={pendingMeals.length}
        joinRequestCount={joinRequests.length}
        pendingListingCount={pendingListings.length}
        onAddExpense={onAddExpense}
      />

      {isManager && attentionCount > 0 && (
        <ManagerInbox
          pendingBazarCount={pending.length}
          pendingBazarTotal={settlement.pendingBazarTotal}
          pendingMealCount={pendingMeals.length}
          joinRequestCount={joinRequests.length}
          pendingListingCount={pendingListings.length}
        />
      )}

      {showSetup && <SetupChecklist tasks={setupTasks} />}

      <section className="metrics-grid" aria-label="Key figures">
        {isManager ? (
          <>
            <MetricCard
              eyebrow="Current meal rate"
              value={settlement.totalMeals > 0 ? formatMoney(settlement.mealRate, { decimals: true }) : "—"}
              meta={
                settlement.totalMeals > 0
                  ? `${formatMoney(settlement.bazarTotal)} across ${settlement.totalMeals} meals`
                  : "Needs approved bazar and meals"
              }
              icon={Utensils}
              tone="sage"
              delta={mealRateDelta(data.trend, data.period)}
            />
            <MetricCard
              eyebrow="Approved bazar"
              value={formatMoney(settlement.bazarTotal)}
              meta={pending.length ? `${pluralize(pending.length, "entry", "entries")} still pending` : "Everything is approved"}
              icon={ShoppingBasket}
              tone="sand"
              href="/bazar"
            />
            <MetricCard
              eyebrow="Shared bills"
              value={formatMoney(settlement.expenseTotal)}
              meta={`${pluralize(data.expenses.length, "expense")} recorded`}
              icon={WalletCards}
              tone="blue"
              href="/expenses"
            />
            <MetricCard
              eyebrow="Needs attention"
              value={String(attentionCount)}
              meta={attentionCount ? "Approvals or requests to review" : "Nothing is waiting on you"}
              icon={ClipboardCheck}
              tone={attentionCount ? "rose" : "sage"}
              href={attentionHref}
            />
          </>
        ) : (
          <>
            <MetricCard
              eyebrow="Your total spend"
              value={formatMoney(personalSpend.total)}
              meta="Meals and every bill share"
              icon={WalletCards}
              tone="sage"
              href="/expenses"
            />
            <MetricCard
              eyebrow="Fixed bills"
              value={formatMoney(personalSpend.fixedBills)}
              meta="Your share of rent and recurring bills"
              icon={Home}
              tone="sand"
              href="/expenses"
            />
            <MetricCard
              eyebrow="Shared bills"
              value={formatMoney(personalSpend.sharedBills)}
              meta="Utilities, maintenance and other costs"
              icon={ReceiptText}
              tone="blue"
              href="/expenses"
            />
            <MetricCard
              eyebrow="Meals from bazar"
              value={formatMoney(personalSpend.meals)}
              meta={
                settlement.totalMeals > 0
                  ? `${pluralize(me?.meals ?? 0, "meal")} × ${formatMoney(settlement.mealRate, { decimals: true })}`
                  : "Waiting for approved bazar and meals"
              }
              icon={CookingPot}
              tone="rose"
              href="/meals"
            />
          </>
        )}
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <PersonalSpendOverview spend={personalSpend} />
          <TodayMeals />
          <RateTrend />
        </div>

        <aside className="dashboard-side">
          <section className="settlement-card">
            <div className="panel-heading inverse">
              <div>
                <span className="section-kicker">YOUR POSITION</span>
                <h3>{periodLabel(data.period)}</h3>
              </div>
            </div>
            <p className="you-owe">
              {Math.abs(me?.balance ?? 0) < 1
                ? "You are square"
                : (me?.balance ?? 0) > 0
                  ? "The mess owes you"
                  : "You owe the mess"}
            </p>
            <strong className="owe-amount">{formatMoney(me?.balance ?? 0)}</strong>
            <dl className="position-breakdown">
              <div className="position-total">
                <dt>Your total spend</dt>
                <dd>{formatMoney(personalSpend.total)}</dd>
              </div>
              <div>
                <dt>You paid</dt>
                <dd>{formatMoney(me?.paid ?? 0)}</dd>
              </div>
              <div>
                <dt>Your meals</dt>
                <dd>{formatMoney(me?.mealCost ?? 0)}</dd>
              </div>
              <div>
                <dt>Bills share</dt>
                <dd>{formatMoney(me?.expenseShare ?? 0)}</dd>
              </div>
            </dl>
            <Link className="settlement-action" href={periodHref("/expenses")}>
              See the full breakdown <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </section>

          <SettleUp />
          {isCurrentPeriod && <NextDuty />}
          <RecentActivity />
        </aside>
      </div>
    </>
  );
}

type PersonalBill = Pick<Expense, "id" | "title" | "category" | "date" | "splitMethod"> & {
  share: number;
};

type PersonalSpend = {
  total: number;
  fixedBills: number;
  sharedBills: number;
  meals: number;
  mealCount: number;
  bills: PersonalBill[];
};

function getPersonalSpend(data: WorkspaceData, member: Member | undefined): PersonalSpend {
  const shares = new Map(
    data.money.transactions
      .filter((transaction) => transaction.source === "mess" && transaction.id.startsWith("mess:"))
      .map((transaction) => [transaction.id.slice("mess:".length), transaction.amount]),
  );
  const bills = data.expenses
    .map((expense) => ({
      id: expense.id,
      title: expense.title,
      category: expense.category,
      date: expense.date,
      splitMethod: expense.splitMethod,
      share: shares.get(expense.id) ?? 0,
    }))
    .filter((expense) => expense.share > 0);
  const fixedBills = bills
    .filter((expense) => expense.category === "Fixed")
    .reduce((sum, expense) => sum + expense.share, 0);
  const sharedBills = bills
    .filter((expense) => expense.category !== "Fixed")
    .reduce((sum, expense) => sum + expense.share, 0);
  const meals = member?.mealCost ?? 0;

  return {
    total: meals + (member?.expenseShare ?? fixedBills + sharedBills),
    fixedBills,
    sharedBills,
    meals,
    mealCount: member?.meals ?? 0,
    bills,
  };
}

function PersonalSpendOverview({ spend }: { spend: PersonalSpend }) {
  const { data } = useWorkspace();
  const periodHref = usePeriodHref();
  const hasMealRate = data.settlement.totalMeals > 0;

  return (
    <section className="panel personal-spend-card" aria-labelledby="personal-spend-title">
      <div className="personal-spend-heading">
        <div>
          <span className="section-kicker">YOUR MONTHLY SPENDING</span>
          <h3 id="personal-spend-title">Every mess cost in one place</h3>
          <p>Fixed bills, shared costs and bazar-funded meals for {periodLabel(data.period)}.</p>
        </div>
        <div className="personal-spend-total">
          <span>Total spend</span>
          <strong>{formatMoney(spend.total)}</strong>
        </div>
      </div>

      <dl className="personal-spend-summary">
        <div>
          <dt>Fixed bills</dt>
          <dd>{formatMoney(spend.fixedBills)}</dd>
        </div>
        <div>
          <dt>Other shared bills</dt>
          <dd>{formatMoney(spend.sharedBills)}</dd>
        </div>
        <div>
          <dt>Meal cost</dt>
          <dd>{formatMoney(spend.meals)}</dd>
        </div>
      </dl>

      <div className="personal-spend-ledger">
        <div className="personal-spend-ledger-heading">
          <div>
            <h4>Your bill breakdown</h4>
            <p>Only your calculated share is shown here.</p>
          </div>
          <Link className="text-button" href={periodHref("/expenses")}>
            Full report <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <ul>
          <li className="personal-spend-row meal-row">
            <span className="metric-icon rose" aria-hidden="true">
              <CookingPot size={18} />
            </span>
            <div>
              <strong>Meals from bazar</strong>
              <small>
                {hasMealRate
                  ? `${pluralize(spend.mealCount, "meal")} × ${formatMoney(data.settlement.mealRate, { decimals: true })}`
                  : "The rate appears after bazar and meals are approved"}
              </small>
            </div>
            <strong>{formatMoney(spend.meals)}</strong>
          </li>
          {spend.bills.map((bill) => {
            const fixed = bill.category === "Fixed";
            const Icon = fixed ? Home : ReceiptText;
            return (
              <li className="personal-spend-row" key={bill.id}>
                <span className={`metric-icon ${fixed ? "sand" : "blue"}`} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{bill.title}</strong>
                  <small>
                    {bill.category} &middot; {formatDate(bill.date, { day: "numeric", month: "short" })} &middot;{" "}
                    {bill.splitMethod === "By room" ? "split by room" : "split equally"}
                  </small>
                </div>
                <strong>{formatMoney(bill.share)}</strong>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="personal-spend-formula">
        <ShoppingBasket size={17} aria-hidden="true" />
        <p>
          <strong>{formatMoney(data.settlement.bazarTotal)} approved bazar</strong>
          {hasMealRate
            ? ` ÷ ${pluralize(data.settlement.totalMeals, "meal")} = ${formatMoney(data.settlement.mealRate, { decimals: true })} per meal. Your bazar share is already included in the meal cost above.`
            : " will be divided by approved meals to calculate everyone’s meal cost."}
        </p>
      </div>
    </section>
  );
}

function PeriodStrip({
  daysLeft,
  isCurrentPeriod,
  isManager,
  hasTodayEntry,
  canEditToday,
  ownPendingCount,
  pendingBazarCount,
  pendingMealCount,
  joinRequestCount,
  pendingListingCount,
  onAddExpense,
}: {
  daysLeft: number;
  isCurrentPeriod: boolean;
  isManager: boolean;
  hasTodayEntry: boolean;
  canEditToday: boolean;
  ownPendingCount: number;
  pendingBazarCount: number;
  pendingMealCount: number;
  joinRequestCount: number;
  pendingListingCount: number;
  onAddExpense: () => void;
}) {
  const { data } = useWorkspace();
  const periodHref = usePeriodHref();
  const attentionCount = pendingBazarCount + pendingMealCount + joinRequestCount + pendingListingCount;
  const closed = data.closure.status === "closed";
  const headline = closed
    ? `${periodLabel(data.period)} is closed.`
    : !isCurrentPeriod
      ? `${periodLabel(data.period)} is still open.`
    : isManager
      ? attentionCount > 0
        ? `${pluralize(attentionCount, "task")} ${attentionCount === 1 ? "needs" : "need"} your attention.`
        : "Your mess is up to date."
      : !hasTodayEntry
        ? canEditToday
          ? "Plan today’s meals in a few taps."
          : "Today’s meal entry is closed."
        : ownPendingCount > 0
          ? `${pluralize(ownPendingCount, "bazar entry", "bazar entries")} waiting for approval.`
          : "You’re all set for today.";
  const detail = closed
    ? `The settlement is frozen${data.closure.closedBy ? ` by ${data.closure.closedBy}` : ""}.`
    : !isCurrentPeriod
      ? isManager
        ? "Review the figures, then close the month to prevent later changes."
        : "A manager can still correct entries and close this month."
    : isManager && attentionCount > 0
      ? `${managerAttentionSummary(pendingBazarCount, pendingMealCount, joinRequestCount, pendingListingCount)}. ${pluralize(daysLeft, "day")} left this month.`
      : !isManager && !hasTodayEntry && canEditToday
        ? `Meal entry closes at ${data.settings.cutoff}. ${pluralize(daysLeft, "day")} left this month.`
        : !isManager && !hasTodayEntry
          ? `The ${data.settings.cutoff} cutoff has passed. Ask a manager if today’s count needs correcting.`
        : `${pluralize(daysLeft, "day")} left in ${periodLabel(data.period)}.`;

  return (
    <section className="welcome-strip">
      <div className="welcome-copy">
        <span className="eyebrow">
          <Sparkles size={14} aria-hidden="true" /> {isManager ? "MANAGER" : "MY OVERVIEW"} &middot; {periodLabel(data.period).toUpperCase()}
        </span>
        <h2>{headline}</h2>
        <p>{detail}</p>
      </div>
      <div className="strip-actions">
        {isCurrentPeriod && !isManager && !closed && (
          <Link className="button button-light" href={periodHref("/meals")}>
            {hasTodayEntry ? "Update meals" : canEditToday ? "Plan my meals" : "View meal plan"}
          </Link>
        )}
        <Link className="button button-light" href={periodHref("/expenses")}>
          {isManager ? "View report" : "View my balance"}
        </Link>
        {isCurrentPeriod && isManager && !closed && (
          <button className="button button-coral" onClick={onAddExpense}>
            <Plus size={17} aria-hidden="true" /> Add expense
          </button>
        )}
      </div>
    </section>
  );
}

function ManagerInbox({
  pendingBazarCount,
  pendingBazarTotal,
  pendingMealCount,
  joinRequestCount,
  pendingListingCount,
}: {
  pendingBazarCount: number;
  pendingBazarTotal: number;
  pendingMealCount: number;
  joinRequestCount: number;
  pendingListingCount: number;
}) {
  const periodHref = usePeriodHref();
  const total = pendingBazarCount + pendingMealCount + joinRequestCount + pendingListingCount;
  const items = [
    pendingMealCount > 0
      ? {
          href: "/meals",
          label: "Meal approvals",
          value: pluralize(pendingMealCount, "entry", "entries"),
          detail: "Review these before calculating the final meal rate",
          icon: Utensils,
          tone: "green",
        }
      : null,
    pendingBazarCount > 0
      ? {
          href: "/bazar",
          label: "Bazar approvals",
          value: pluralize(pendingBazarCount, "entry", "entries"),
          detail: `${formatMoney(pendingBazarTotal)} is not in the meal rate yet`,
          icon: ShoppingBasket,
          tone: "coral",
        }
      : null,
    joinRequestCount > 0
      ? {
          href: "/members",
          label: "Join requests",
          value: pluralize(joinRequestCount, "person", "people"),
          detail: "Approve them and optionally assign a room",
          icon: UserPlus,
          tone: "blue",
        }
      : null,
    pendingListingCount > 0
      ? {
          href: "/house/listings",
          label: "Listing reviews",
          value: pluralize(pendingListingCount, "post"),
          detail: "Review before it becomes public",
          icon: Megaphone,
          tone: "sand",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <section className="panel manager-inbox" aria-labelledby="manager-inbox-title">
      <div className="manager-inbox-heading">
        <span className="manager-inbox-icon" aria-hidden="true">
          <ClipboardCheck size={21} />
        </span>
        <div>
          <span className="section-kicker">MANAGER INBOX</span>
          <h3 id="manager-inbox-title">{pluralize(total, "item")} waiting for you</h3>
          <p>Handle these first so member totals and public listings stay accurate.</p>
        </div>
      </div>
      <div className="manager-inbox-list">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={periodHref(item.href)} className="manager-inbox-item">
              <span className={`manager-inbox-item-icon ${item.tone}`} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <em>{item.detail}</em>
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function managerAttentionSummary(bazar: number, meals: number, members: number, listings: number) {
  return [
    bazar ? pluralize(bazar, "bazar approval") : "",
    meals ? pluralize(meals, "meal approval") : "",
    members ? pluralize(members, "join request") : "",
    listings ? pluralize(listings, "listing review") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function SetupChecklist({ tasks }: { tasks: { done: boolean; label: string; href: string }[] }) {
  const periodHref = usePeriodHref();
  const remaining = tasks.filter((task) => !task.done);
  return (
    <section className="setup-card">
      <div>
        <span className="section-kicker">FINISH SETTING UP</span>
        <h3>
          {tasks.length - remaining.length} of {tasks.length} steps done
        </h3>
        <p>MessMate can only work out a meal rate once there is something to divide.</p>
      </div>
      <ol className="setup-steps">
        {tasks.map((task) => (
          <li key={task.href} className={task.done ? "done" : ""}>
            <span className="setup-tick" aria-hidden="true">
              {task.done ? <Check size={13} /> : <ArrowRight size={13} />}
            </span>
            {task.done ? (
              <span>{task.label}</span>
            ) : (
              <Link href={periodHref(task.href)}>{task.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetricCard({
  eyebrow,
  value,
  meta,
  icon: Icon,
  tone,
  delta,
  href,
}: {
  eyebrow: string;
  value: string;
  meta: string;
  icon: typeof Utensils;
  tone: string;
  delta?: { direction: "up" | "down"; text: string };
  href?: string;
}) {
  const periodHref = usePeriodHref();
  const body = (
    <>
      <div className={`metric-icon ${tone}`} aria-hidden="true">
        <Icon size={20} strokeWidth={1.9} />
      </div>
      <p>{eyebrow}</p>
      <div className="metric-value-row">
        <strong>{value}</strong>
        {delta && (
          <span className={delta.direction === "down" ? "delta-good" : "delta-bad"}>
            {delta.direction === "down" ? (
              <ArrowDownRight size={13} aria-hidden="true" />
            ) : (
              <ArrowUpRight size={13} aria-hidden="true" />
            )}
            {delta.text}
          </span>
        )}
      </div>
      <small>{meta}</small>
    </>
  );
  return href ? (
    <Link className="metric-card metric-link" href={periodHref(href)}>
      {body}
    </Link>
  ) : (
    <article className="metric-card">{body}</article>
  );
}

/** Compares this month's rate with the previous month that actually had meals. */
function mealRateDelta(trend: { period: string; mealRate: number }[], period: string) {
  const index = trend.findIndex((point) => point.period === period);
  if (index < 1) return undefined;
  const current = trend[index].mealRate;
  if (!current) return undefined;
  const previous = [...trend.slice(0, index)].reverse().find((point) => point.mealRate > 0);
  if (!previous) return undefined;
  const change = ((current - previous.mealRate) / previous.mealRate) * 100;
  if (Math.abs(change) < 0.5) return undefined;
  return {
    direction: change > 0 ? ("up" as const) : ("down" as const),
    text: `${Math.abs(change).toFixed(1)}%`,
  };
}

function TodayMeals() {
  const { data } = useWorkspace();
  const today = todayInZone(data.settings.timezone);
  const saved = data.meals.find((entry) => entry.date === today);
  // Keying on the stored counts restarts the editor whenever the server value
  // changes, so the stepper can never show a stale number after a save.
  const savedKey = `${data.period}-${saved?.breakfast ?? 0}-${saved?.lunch ?? 0}-${saved?.dinner ?? 0}`;
  return <TodayMealsEditor key={savedKey} today={today} saved={saved} />;
}

function TodayMealsEditor({
  today,
  saved,
}: {
  today: string;
  saved: MealEntry | undefined;
}) {
  const { data, runAction, busy, isManager } = useWorkspace();
  const [mountedAt] = useState(() => Date.now());
  const enabled = MEAL_KEYS.filter((key) => data.settings.mealTypes[key]);

  const [draft, setDraft] = useState(() => ({
    breakfast: saved?.breakfast ?? 0,
    lunch: saved?.lunch ?? 0,
    dinner: saved?.dinner ?? 0,
  }));
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  const total = enabled.reduce((sum, key) => sum + draft[key], 0);
  const dirty = enabled.some((key) => draft[key] !== (saved?.[key] ?? 0));
  const notCurrentMonth = data.period !== periodInZone(data.settings.timezone);
  const locked =
    !isManager &&
    !data.settings.allowAnytime &&
    cutoffHasPassed(data.settings.timezone, data.settings.cutoff, new Date(mountedAt));

  const save = async () => {
    if (locked) return;
    const result = await runAction("saveMeals", { date: today, meals: draft }, "Today’s meals saved.");
    if (result) setJustSaved(true);
  };

  if (notCurrentMonth) {
    return (
      <section className="panel meals-today">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">MEAL ENTRY</span>
            <h3>Today&rsquo;s meals</h3>
          </div>
        </div>
        <EmptyState
          icon={<Utensils size={22} aria-hidden="true" />}
          title="Not this month"
          message={`Switch back to ${periodLabel(periodInZone(data.settings.timezone))} to record today’s meals.`}
        />
      </section>
    );
  }

  return (
    <section className="panel meals-today">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            TODAY &middot; {formatDate(today, { weekday: "long", day: "numeric", month: "short" }).toUpperCase()}
          </span>
          <h3>Today&rsquo;s meals</h3>
        </div>
        <span className={`entry-window ${locked ? "closed" : ""}`}>
          <Clock3 size={14} aria-hidden="true" />{" "}
          {locked
            ? "Closed for today"
            : data.settings.allowAnytime || isManager
              ? "Open all day"
              : `Closes at ${data.settings.cutoff}`}
        </span>
      </div>

      <div className="meal-options">
        {enabled.map((key, index) => (
          <div className="meal-control" key={key}>
            <div className={`meal-symbol meal-${index}`} aria-hidden="true">
              <span>{MEAL_META[key].symbol}</span>
            </div>
            <div className="meal-name">
              <strong>{MEAL_META[key].label}</strong>
              <small>{draft[key] === 0 ? "Skipping" : pluralize(draft[key], "portion")}</small>
            </div>
            <div className="stepper">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, [key]: Math.max(0, draft[key] - 1) })}
                aria-label={`One fewer ${MEAL_META[key].label.toLowerCase()}`}
                disabled={locked || draft[key] === 0}
              >
                <Minus size={15} aria-hidden="true" />
              </button>
              <strong aria-live="polite">{draft[key]}</strong>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, [key]: Math.min(9, draft[key] + 1) })}
                aria-label={`One more ${MEAL_META[key].label.toLowerCase()}`}
                disabled={locked}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="meal-footer">
        <div>
          <strong>{pluralize(total, "meal")}</strong>
          <span>
            {locked
              ? "Ask a manager if today’s meal count needs correcting"
              : data.settlement.mealRate > 0
              ? `About ${formatMoney(total * data.settlement.mealRate)} at the current rate`
              : "The rate appears once bazar is approved"}
          </span>
        </div>
        <ActionButton
          busy={busy}
          busyLabel="Saving…"
          className={`button ${justSaved ? "button-success" : "button-dark"}`}
          onClick={save}
          disabled={locked || (!dirty && !justSaved)}
        >
          {justSaved ? (
            <>
              <Check size={16} aria-hidden="true" /> Saved
            </>
          ) : locked ? (
            "Entry closed"
          ) : dirty ? (
            "Save today’s meals"
          ) : (
            "Up to date"
          )}
        </ActionButton>
      </div>
    </section>
  );
}

function RateTrend() {
  const { data } = useWorkspace();
  const periodHref = usePeriodHref();
  const points = data.trend;
  const max = Math.max(...points.map((point) => point.mealRate), 1);
  const withData = points.filter((point) => point.mealRate > 0);
  const current = points.find((point) => point.period === data.period);

  return (
    <section className="panel trend-card">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">MEAL RATE HISTORY</span>
          <h3>Cost per meal</h3>
        </div>
        <Link className="text-button" href={periodHref("/meals")}>
          Meal planner <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>

      {withData.length === 0 ? (
        <EmptyState
          icon={<ShoppingBasket size={22} aria-hidden="true" />}
          title="No history yet"
          message="Once a month has approved bazar and meal entries, its rate appears here."
        />
      ) : (
        <>
          <div className="chart-meta">
            <strong>
              {current?.mealRate
                ? formatMoney(current.mealRate, { decimals: true })
                : formatMoney(0, { decimals: true })}
            </strong>
            <span>per meal in {periodLabel(data.period)}</span>
          </div>
          <div className="bar-chart" role="img" aria-label={trendSummary(points)}>
            {points.map((point) => (
              <div className="bar-column" key={point.period}>
                <div
                  className={`bar ${point.period === data.period ? "active" : ""} ${point.mealRate === 0 ? "empty" : ""}`}
                  style={{ height: `${point.mealRate > 0 ? Math.max(6, (point.mealRate / max) * 100) : 2}%` }}
                  title={`${point.label}: ${point.mealRate > 0 ? formatMoney(point.mealRate, { decimals: true }) : "no data"}`}
                >
                  {point.period === data.period && <i aria-hidden="true" />}
                </div>
                <span>{point.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function trendSummary(points: { label: string; mealRate: number }[]) {
  const described = points
    .filter((point) => point.mealRate > 0)
    .map((point) => `${point.label} ${formatMoney(point.mealRate, { decimals: true })}`)
    .join(", ");
  return `Meal rate by month: ${described || "no data yet"}`;
}

function SettleUp() {
  const { data } = useWorkspace();
  const { transfers } = data.settlement;
  const mine = data.workspace.userId;

  return (
    <section className="panel settle-card">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">TO CLOSE THE MONTH</span>
          <h3>Who pays whom</h3>
        </div>
        <Handshake size={20} className="muted-icon" aria-hidden="true" />
      </div>
      {transfers.length === 0 ? (
        <p className="settle-clear">
          <Check size={15} aria-hidden="true" /> Everyone is square.
        </p>
      ) : (
        <ul className="settle-list">
          {transfers.map((transfer) => (
            <li
              key={`${transfer.fromId}-${transfer.toId}`}
              className={transfer.fromId === mine || transfer.toId === mine ? "involves-me" : ""}
            >
              <span>
                <strong>{transfer.fromId === mine ? "You" : transfer.from.split(" ")[0]}</strong>
                <ArrowRight size={13} aria-hidden="true" />
                <strong>{transfer.toId === mine ? "you" : transfer.to.split(" ")[0]}</strong>
              </span>
              <b>{formatMoney(transfer.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextDuty() {
  const { data } = useWorkspace();
  const periodHref = usePeriodHref();
  const mine = data.roster.find((slot) => slot.memberId === data.workspace.userId);
  const next = data.roster[0];

  if (!next) return null;
  const slot = mine ?? next;
  const isMine = slot.memberId === data.workspace.userId;
  const date = new Date(`${slot.date}T12:00:00`);

  return (
    <section className="panel duty-card">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">BAZAR ROSTER</span>
          <h3>{isMine ? "Your next turn" : "Next bazar run"}</h3>
        </div>
        <ShoppingBasket size={20} className="muted-icon" aria-hidden="true" />
      </div>
      <div className="date-block" aria-hidden="true">
        <span>{date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}</span>
        <strong>{date.getDate()}</strong>
        <small>{date.toLocaleDateString("en-GB", { month: "long" })}</small>
      </div>
      <div className="duty-details">
        <strong>{formatDate(slot.date, { weekday: "long", day: "numeric", month: "long" })}</strong>
        <p>{isMine ? "You are on bazar duty" : `${slot.name} is on bazar duty`}</p>
        <Avatar name={slot.name} color={slot.color} size="sm" avatarId={slot.avatarId} />
      </div>
      <Link className="subtle-button" href={periodHref("/bazar")}>
        See the full roster <ChevronRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}

function RecentActivity() {
  const { data, openPanel } = useWorkspace();
  const items = data.activity.slice(0, 4);
  return (
    <section className="panel activity-card">
      <div className="panel-heading">
        <h3>Recent activity</h3>
        <button className="text-button" onClick={() => openPanel("notifications")}>
          View all
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" message="Activity appears as your mess records meals and spending." />
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li className="activity-item" key={item.id}>
              <span className={`activity-dot ${item.tone}`} aria-hidden="true">
                <Check size={12} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <time dateTime={item.createdAt} suppressHydrationWarning>
                {relativeTime(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
