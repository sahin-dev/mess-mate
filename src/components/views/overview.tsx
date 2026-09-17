"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  CookingPot,
  Handshake,
  Minus,
  Plus,
  ShoppingBasket,
  Sparkles,
  Utensils,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, formatMoney, pluralize, relativeTime } from "@/lib/format";
import { daysLeftInPeriod, periodLabel } from "@/lib/period";
import { periodInZone, todayInZone } from "@/lib/timezone";
import type { MealEntry, MealKey } from "@/lib/types";
import { ActionButton, Avatar, EmptyState } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const MEAL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];
const MEAL_META: Record<MealKey, { label: string; symbol: string }> = {
  breakfast: { label: "Breakfast", symbol: "☕" },
  lunch: { label: "Lunch", symbol: "◒" },
  dinner: { label: "Dinner", symbol: "☾" },
};

export function OverviewView({ onAddExpense }: { onAddExpense: () => void }) {
  const { data, isManager } = useWorkspace();
  const { settlement, workspace } = data;

  const activeMembers = data.members.filter((member) => member.status === "active");
  const me = data.members.find((member) => member.id === workspace.userId);
  const timeZone = data.settings.timezone;
  const isCurrentPeriod = data.period === periodInZone(timeZone);
  const daysLeft = daysLeftInPeriod(data.period, timeZone);
  const pending = data.bazar.filter((entry) => entry.status === "Pending");

  // A brand-new mess has nothing to show, so send the manager through setup
  // instead of a dashboard full of zeros.
  const setupTasks = [
    { done: data.rooms.length > 0, label: "Add your rooms and rent", href: "/rooms" },
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
        pendingCount={pending.length}
        onAddExpense={onAddExpense}
        canAddExpense={isManager}
      />

      {showSetup && <SetupChecklist tasks={setupTasks} />}

      <section className="metrics-grid" aria-label="Key figures">
        <MetricCard
          eyebrow="Meal rate"
          value={settlement.totalMeals > 0 ? formatMoney(settlement.mealRate, { decimals: true }) : "—"}
          meta={
            settlement.totalMeals > 0
              ? `${formatMoney(settlement.bazarTotal)} bazar ÷ ${settlement.totalMeals} meals`
              : "Add bazar and meals to calculate"
          }
          icon={Utensils}
          tone="sage"
          delta={mealRateDelta(data.trend, data.period)}
        />
        <MetricCard
          eyebrow="Your meals"
          value={String(me?.meals ?? 0)}
          meta={`${formatMoney(me?.mealCost ?? 0)} of food this month`}
          icon={CookingPot}
          tone="sand"
        />
        <MetricCard
          eyebrow="Mess spend"
          value={formatMoney(settlement.bazarTotal + settlement.expenseTotal)}
          meta={`${formatMoney(settlement.bazarTotal)} bazar + ${formatMoney(settlement.expenseTotal)} bills`}
          icon={WalletCards}
          tone="blue"
        />
        <MetricCard
          eyebrow="Awaiting approval"
          value={String(pending.length)}
          meta={
            pending.length > 0
              ? `${formatMoney(settlement.pendingBazarTotal)} not yet counted`
              : "Everything is reviewed"
          }
          icon={Clock3}
          tone={pending.length > 0 ? "rose" : "sage"}
          href="/bazar"
        />
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
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
            <Link className="settlement-action" href="/expenses">
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

function PeriodStrip({
  daysLeft,
  isCurrentPeriod,
  pendingCount,
  onAddExpense,
  canAddExpense,
}: {
  daysLeft: number;
  isCurrentPeriod: boolean;
  pendingCount: number;
  onAddExpense: () => void;
  canAddExpense: boolean;
}) {
  const { data } = useWorkspace();
  const headline = !isCurrentPeriod
    ? `${periodLabel(data.period)} is closed.`
    : pendingCount > 0
      ? pendingCount === 1
        ? "1 bazar entry needs a review."
        : `${pendingCount} bazar entries need a review.`
      : "Your mess is running smoothly.";
  const detail = !isCurrentPeriod
    ? "You are looking at a past month. Figures no longer change."
    : `${pluralize(daysLeft, "day")} left in ${periodLabel(data.period)}.`;

  return (
    <section className="welcome-strip">
      <div className="welcome-copy">
        <span className="eyebrow">
          <Sparkles size={14} aria-hidden="true" /> {periodLabel(data.period).toUpperCase()}
        </span>
        <h2>{headline}</h2>
        <p>{detail}</p>
      </div>
      <div className="strip-actions">
        <Link className="button button-light" href="/expenses">
          View report
        </Link>
        {canAddExpense && (
          <button className="button button-coral" onClick={onAddExpense}>
            <Plus size={17} aria-hidden="true" /> Add expense
          </button>
        )}
      </div>
    </section>
  );
}

function SetupChecklist({ tasks }: { tasks: { done: boolean; label: string; href: string }[] }) {
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
              <Link href={task.href}>{task.label}</Link>
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
    <Link className="metric-card metric-link" href={href}>
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
  const { data, runAction, busy } = useWorkspace();
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

  const save = async () => {
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
        <span className="entry-window">
          <Clock3 size={14} aria-hidden="true" />{" "}
          {data.settings.allowAnytime ? "Open all day" : `Closes at ${data.settings.cutoff}`}
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
                disabled={draft[key] === 0}
              >
                <Minus size={15} aria-hidden="true" />
              </button>
              <strong aria-live="polite">{draft[key]}</strong>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, [key]: Math.min(9, draft[key] + 1) })}
                aria-label={`One more ${MEAL_META[key].label.toLowerCase()}`}
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
            {data.settlement.mealRate > 0
              ? `About ${formatMoney(total * data.settlement.mealRate)} at the current rate`
              : "The rate appears once bazar is approved"}
          </span>
        </div>
        <ActionButton
          busy={busy}
          busyLabel="Saving…"
          className={`button ${justSaved ? "button-success" : "button-dark"}`}
          onClick={save}
          disabled={!dirty && !justSaved}
        >
          {justSaved ? (
            <>
              <Check size={16} aria-hidden="true" /> Saved
            </>
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
        <Link className="text-button" href="/meals">
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
      <Link className="subtle-button" href="/bazar">
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
