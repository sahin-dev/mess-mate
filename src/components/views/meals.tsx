"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CookingPot,
  Lock,
  Minus,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCsv, formatDate, formatMoney, pluralize } from "@/lib/format";
import { daysInPeriod, periodLabel } from "@/lib/period";
import { cutoffHasPassed, periodInZone, timezoneOffsetLabel, todayInZone } from "@/lib/timezone";
import type { MealKey } from "@/lib/types";
import { ActionButton, EmptyState, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const ALL_KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];
const SHORT: Record<MealKey, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const PAGE_SIZE = 7;

type Counts = Record<MealKey, number>;

export function MealsView() {
  const { data, runAction, busy, isManager } = useWorkspace();
  const timeZone = data.settings.timezone;
  const today = todayInZone(timeZone);
  const keys = ALL_KEYS.filter((key) => data.settings.mealTypes[key]);

  const days = useMemo(() => {
    const total = daysInPeriod(data.period);
    return Array.from({ length: total }, (_, index) => `${data.period}-${String(index + 1).padStart(2, "0")}`);
  }, [data.period]);

  // Start on the week that contains today, so the useful rows are on screen.
  // The default is derived; state only holds a deliberate move by the user.
  const todayIndex = days.indexOf(today);
  const defaultOffset = todayIndex >= 0 ? Math.floor(todayIndex / PAGE_SIZE) * PAGE_SIZE : 0;
  const [pagedTo, setPagedTo] = useState<{ period: string; offset: number } | null>(null);
  const offset = pagedTo?.period === data.period ? pagedTo.offset : defaultOffset;
  const goToOffset = (next: number) =>
    setPagedTo({ period: data.period, offset: Math.max(0, Math.min(days.length - PAGE_SIZE, next)) });

  const savedByDate = useMemo(
    () => new Map(data.meals.map((entry) => [entry.date, entry])),
    [data.meals],
  );

  /**
   * Edits are collected locally and written per day. Sending one request per
   * tap made every click wait for a full workspace reload.
   */
  const [draftState, setDraftState] = useState<{ period: string; days: Record<string, Counts> }>({
    period: data.period,
    days: {},
  });
  // Drafts belong to one month; switching the picker discards them by mismatch
  // rather than by clearing them from an effect.
  const drafts = draftState.period === data.period ? draftState.days : {};
  const setDrafts = (days: Record<string, Counts>) => setDraftState({ period: data.period, days });
  const [savingDate, setSavingDate] = useState<string | null>(null);
  // Dates that just saved, so the row can confirm it briefly before going back
  // to showing the entry's status.
  const [recentlySaved, setRecentlySaved] = useState<string[]>([]);

  const countFor = (date: string, key: MealKey) =>
    drafts[date]?.[key] ?? savedByDate.get(date)?.[key] ?? 0;

  // One clock reading for the whole render, so rows cannot disagree about
  // whether the cutoff has passed. It is read in the mess's timezone, which is
  // what the server enforces, so the UI never disagrees with the API.
  const [mountedAt] = useState(() => Date.now());
  const cutoffPassed = cutoffHasPassed(timeZone, data.settings.cutoff, new Date(mountedAt));

  const isLocked = (date: string) => {
    if (isManager || data.settings.allowAnytime) return false;
    if (date > today) return false;
    if (date < today) return true;
    return cutoffPassed;
  };

  const adjust = (date: string, key: MealKey, delta: number) => {
    const current: Counts = {
      breakfast: countFor(date, "breakfast"),
      lunch: countFor(date, "lunch"),
      dinner: countFor(date, "dinner"),
    };
    setDrafts({
      ...drafts,
      [date]: { ...current, [key]: Math.max(0, Math.min(9, current[key] + delta)) },
    });
  };

  const saveDay = async (date: string) => {
    const draft = drafts[date];
    if (!draft) return;
    setSavingDate(date);
    const result = await runAction("saveMeals", { date, meals: draft });
    setSavingDate(null);
    if (result) {
      setRecentlySaved((current) => [...current.filter((entry) => entry !== date), date]);
      window.setTimeout(
        () => setRecentlySaved((current) => current.filter((entry) => entry !== date)),
        2500,
      );
      const remaining = { ...drafts };
      delete remaining[date];
      setDrafts(remaining);
    }
  };

  const saveAll = async () => {
    const dates = Object.keys(drafts);
    for (const date of dates) {
      // Sequential on purpose: each write returns a fresh workspace snapshot.
      await saveDay(date);
    }
  };

  const dirtyDates = Object.keys(drafts).filter((date) => {
    const saved = savedByDate.get(date);
    return ALL_KEYS.some((key) => drafts[date][key] !== (saved?.[key] ?? 0));
  });

  const me = data.members.find((member) => member.id === data.workspace.userId);
  const visible = days.slice(offset, offset + PAGE_SIZE);
  const exportMeals = () =>
    downloadCsv(`messmate-meals-${data.period}.csv`, [
      ["Date", "Breakfast", "Lunch", "Dinner", "Total"],
      ...days.map((date) => {
        const entry = savedByDate.get(date);
        const total = ALL_KEYS.reduce((sum, key) => sum + (entry?.[key] ?? 0), 0);
        return [date, entry?.breakfast ?? 0, entry?.lunch ?? 0, entry?.dinner ?? 0, total];
      }),
    ]);

  return (
    <>
      <SectionHeading
        kicker={periodLabel(data.period).toUpperCase()}
        title="My meal entries"
        description={
          data.settings.allowAnytime
            ? "Entries stay open all month."
            : `Plan future days freely. Today closes at ${data.settings.cutoff} ${timezoneOffsetLabel(timeZone)}.`
        }
        action={
          <>
            <button
              className="button button-outline"
              onClick={() => goToOffset(offset - PAGE_SIZE)}
              disabled={offset === 0}
              aria-label="Earlier days"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              className="button button-outline"
              onClick={() => goToOffset(defaultOffset)}
            >
              This week
            </button>
            <button
              className="button button-outline"
              onClick={() => goToOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= days.length}
              aria-label="Later days"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </>
        }
      />

      <div className="meal-summary-banner">
        <div>
          <CookingPot size={25} aria-hidden="true" />
          <span>
            <strong>{pluralize(me?.meals ?? 0, "meal")} this month</strong>
            <small>
              {data.settlement.mealRate > 0
                ? `${formatMoney(me?.mealCost ?? 0)} of food at ${formatMoney(data.settlement.mealRate, { decimals: true })} per meal`
                : "The meal rate appears once bazar is approved"}
            </small>
          </span>
        </div>
        <div>
          <span className="summary-stat">
            <b>{data.settlement.totalMeals}</b>
            <small>Mess total</small>
          </span>
          <span className="summary-stat">
            <b>
              {data.settlement.mealRate > 0
                ? formatMoney(data.settlement.mealRate, { decimals: true })
                : "—"}
            </b>
            <small>Meal rate</small>
          </span>
          <span className="summary-stat">
            <b>{formatMoney(data.settlement.bazarTotal)}</b>
            <small>Approved bazar</small>
          </span>
        </div>
      </div>

      <section className="panel meal-table-card">
        <div className="table-toolbar">
          <div>
            <h3>
              {formatDate(visible[0], { day: "numeric", month: "short" })} &ndash;{" "}
              {formatDate(visible[visible.length - 1], { day: "numeric", month: "short" })}
            </h3>
            <p>Your own breakfast, lunch and dinner counts</p>
          </div>
          <div className="view-actions">
            <span className="entry-window">
              <Clock3 size={14} aria-hidden="true" />{" "}
              {data.settings.allowAnytime ? "Always open" : `Cutoff ${data.settings.cutoff}`}
            </span>
            <button className="filter-button" onClick={exportMeals}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="meal-table">
          <div className="meal-table-head" role="row">
            <span>Date</span>
            {keys.map((key) => (
              <span key={key}>{SHORT[key]}</span>
            ))}
            <span>Total</span>
            <span />
          </div>
          {visible.map((date) => {
            const locked = isLocked(date);
            const isToday = date === today;
            const saved = savedByDate.get(date);
            const dirty = dirtyDates.includes(date);
            const total = keys.reduce((sum, key) => sum + countFor(date, key), 0);
            const flashed = recentlySaved.includes(date);
            const day = new Date(`${date}T12:00:00`);
            return (
              <div className={`meal-table-row ${isToday ? "today" : ""} ${locked ? "locked" : ""}`} key={date}>
                <div className="date-cell">
                  <span>{day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                  <strong>{day.getDate()}</strong>
                  {isToday && <small>Today</small>}
                </div>
                {keys.map((key) => (
                  <div className="compact-stepper" key={key}>
                    <button
                      type="button"
                      disabled={locked || countFor(date, key) === 0}
                      aria-label={`One fewer ${SHORT[key].toLowerCase()} on ${formatDate(date)}`}
                      onClick={() => adjust(date, key, -1)}
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <strong>{countFor(date, key)}</strong>
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={`One more ${SHORT[key].toLowerCase()} on ${formatDate(date)}`}
                      onClick={() => adjust(date, key, 1)}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <strong className="meal-total">{total}</strong>
                <div className="row-state">
                  {locked ? (
                    <span className="lock-pill" title="Past the cutoff">
                      <Lock size={12} aria-hidden="true" /> Locked
                    </span>
                  ) : dirty ? (
                    <ActionButton
                      busy={savingDate === date}
                      busyLabel=""
                      className="button button-dark button-tiny"
                      onClick={() => saveDay(date)}
                    >
                      Save
                    </ActionButton>
                  ) : flashed ? (
                    <span className="saved-pill">
                      <Check size={12} aria-hidden="true" /> Saved
                    </span>
                  ) : saved ? (
                    <span className={`status-pill ${saved.status.toLowerCase()}`}>{saved.status}</span>
                  ) : (
                    <span className="muted-note">No entry</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="table-save">
          {dirtyDates.length > 0 ? (
            <>
              <span>
                {pluralize(dirtyDates.length, "day")} changed but not saved
              </span>
              <ActionButton busy={busy} busyLabel="Saving…" className="button button-dark button-tiny" onClick={saveAll}>
                Save all changes
              </ActionButton>
            </>
          ) : (
            <>
              <span>Changes are saved per day</span>
              <span className="save-indicator">
                <Check size={13} aria-hidden="true" /> Everything saved
              </span>
            </>
          )}
        </div>
      </section>

      {data.period !== periodInZone(timeZone) && (
        <EmptyState
          title="This is a past month"
          message="Only a manager can still change entries for a month that has ended."
        />
      )}
    </>
  );
}
