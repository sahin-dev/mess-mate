"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Check, Plus } from "lucide-react";
import { formatDate, pluralize } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { todayInZone } from "@/lib/timezone";
import type { MealCounts, MealKey, MealReconciliationDay } from "@/lib/types";
import { ActionButton, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const KEYS: MealKey[] = ["breakfast", "lunch", "dinner"];
const LABELS: Record<MealKey, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const total = (counts: MealCounts) => KEYS.reduce((sum, key) => sum + counts[key], 0);
const detail = (counts: MealCounts) => `B ${counts.breakfast} · L ${counts.lunch} · D ${counts.dinner}`;
const emptyCounts = (): MealCounts => ({ breakfast: 0, lunch: 0, dinner: 0 });

export function MealReconciliationPanel() {
  const { data, isManager } = useWorkspace();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const today = todayInZone(data.settings.timezone);
  const { totals, loggedDays, missingLogDays } = data.mealReconciliation;
  const days = data.mealReconciliation.days.filter((day) => day.date <= today);
  const needsReview = loggedDays === 0 || totals.unexplained + totals.overclaimed + totals.pending + missingLogDays > 0;
  const reviewItems = [
    missingLogDays > 0 ? `${pluralize(missingLogDays, "day")} without a kitchen log` : null,
    totals.pending > 0 ? `${pluralize(totals.pending, "pending member meal")}` : null,
    totals.unexplained > 0 ? `${pluralize(totals.unexplained, "unexplained portion")}` : null,
    totals.overclaimed > 0 ? `${pluralize(totals.overclaimed, "overclaimed portion")}` : null,
  ].filter(Boolean);

  return <>
    <section className="panel kitchen-panel" aria-labelledby="kitchen-title">
      <div className="table-toolbar">
        <div>
          <span className="section-kicker">KITCHEN CHECK</span>
          <h3 id="kitchen-title">Cooked vs member meals</h3>
          <p>Independent kitchen counts for {periodLabel(data.period)}. Approved entries are used for the meal rate; pending entries are shown separately.</p>
        </div>
        {isManager && data.closure.status !== "closed" && data.period <= today.slice(0, 7) && (
          <button className="button button-dark" onClick={() => setEditingDate(data.period === today.slice(0, 7) ? today : `${data.period}-01`)}>
            <Plus size={16} aria-hidden="true" /> Record cooked meals
          </button>
        )}
      </div>
      <div className="kitchen-metrics">
        <div><span>Cooked</span><strong>{totals.cooked}</strong><small>{pluralize(loggedDays, "day")} logged</small></div>
        <div><span>Approved entries</span><strong>{totals.approved}</strong><small>Used in settlement</small></div>
        <div><span>Recorded waste</span><strong>{totals.wasted}</strong><small>Confirmed by manager</small></div>
        <div className={totals.unexplained ? "attention" : ""}><span>Unexplained</span><strong>{totals.unexplained}</strong><small>After pending entries</small></div>
        <div className={totals.overclaimed ? "attention" : ""}><span>Overclaimed</span><strong>{totals.overclaimed}</strong><small>Claims + waste above cooked</small></div>
      </div>
      <p className={`kitchen-status ${needsReview ? "needs-review" : ""}`}>
        {needsReview ? <AlertCircle size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
        {loggedDays === 0
          ? "No cooked counts yet. Record what the kitchen prepared to start checking for missing meals or waste."
          : needsReview
            ? `Review ${reviewItems.join(", ")}. Pending entries may change the final comparison.`
            : "All logged kitchen counts match approved member entries and recorded waste."}
      </p>
      {days.length > 0 && <div className="kitchen-table-scroll"><table className="kitchen-table">
        <thead><tr><th>Date</th><th>Cooked</th><th>Approved</th><th>Pending</th><th>Waste</th><th>Unexplained</th><th>Overclaimed</th>{isManager && data.closure.status !== "closed" && <th />}</tr></thead>
        <tbody>{days.map((day) => <KitchenRow key={day.date} day={day} canEdit={isManager && data.closure.status !== "closed"} onEdit={() => setEditingDate(day.date)} />)}</tbody>
      </table></div>}
      <p className="kitchen-footnote">Unexplained means cooked meals left after approved claims, pending claims and recorded waste. It may be an unentered meal; only recorded waste is called waste.</p>
    </section>
    {editingDate && <CookedMealsModal key={editingDate} initialDate={editingDate} onClose={() => setEditingDate(null)} />}
  </>;
}

function KitchenRow({ day, canEdit, onEdit }: { day: MealReconciliationDay; canEdit: boolean; onEdit: () => void }) {
  return <tr>
    <td><strong>{formatDate(day.date, { day: "numeric", month: "short" })}</strong>{!day.cooked && <small>Not logged</small>}</td>
    <td>{day.cooked ? <>{total(day.cooked)}<small>{detail(day.cooked)}</small></> : "—"}</td>
    <td>{total(day.approved)}<small>{detail(day.approved)}</small></td>
    <td>{total(day.pending)}<small>{detail(day.pending)}</small></td>
    <td>{day.cooked ? <>{total(day.wasted)}<small>{detail(day.wasted)}</small></> : "—"}</td>
    <td className={total(day.unexplained) ? "kitchen-alert" : ""}>{day.cooked ? total(day.unexplained) : "—"}</td>
    <td className={total(day.overclaimed) ? "kitchen-alert" : ""}>{day.cooked ? total(day.overclaimed) : "—"}</td>
    {canEdit && <td><button className="text-button" onClick={onEdit}>{day.cooked ? "Edit" : "Log"}</button></td>}
  </tr>;
}

function CookedMealsModal({ initialDate, onClose }: { initialDate: string; onClose: () => void }) {
  const { data, runAction, busy } = useWorkspace();
  const existing = (date: string) => data.cookedMeals.find((entry) => entry.date === date);
  const [date, setDate] = useState(initialDate);
  const [cooked, setCooked] = useState<MealCounts>(() => existing(initialDate)?.cooked ?? emptyCounts());
  const [wasted, setWasted] = useState<MealCounts>(() => existing(initialDate)?.wasted ?? emptyCounts());
  const today = todayInZone(data.settings.timezone);
  const invalid = KEYS.some((key) => !Number.isInteger(cooked[key]) || !Number.isInteger(wasted[key]) ||
    cooked[key] < 0 || wasted[key] < 0 || wasted[key] > cooked[key] || cooked[key] > 10_000);
  const changeDate = (next: string) => {
    setDate(next);
    setCooked(existing(next)?.cooked ?? emptyCounts());
    setWasted(existing(next)?.wasted ?? emptyCounts());
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    const saved = await runAction("saveCookedMeals", { date, cooked, wasted }, "Kitchen count saved.");
    if (saved) onClose();
  };
  return <Modal title="Kitchen meal count" subtitle="Record what was actually cooked and any confirmed waste. Member entries stay separate." onClose={onClose}>
    <form onSubmit={save}>
      <label>Date
        <input type="date" required min={`${data.period}-01`} max={data.period === today.slice(0, 7) ? today : `${data.period}-31`} value={date} onChange={(event) => changeDate(event.target.value)} />
      </label>
      <div className="kitchen-input-head"><span>Meal</span><span>Cooked</span><span>Wasted</span></div>
      {KEYS.map((key) => <div className="kitchen-input-row" key={key}>
        <strong>{LABELS[key]}</strong>
        <input type="number" min="0" max="10000" step="1" required aria-label={`${LABELS[key]} cooked`} value={cooked[key]} onChange={(event) => setCooked({ ...cooked, [key]: Number(event.target.value) })} />
        <input type="number" min="0" max={cooked[key]} step="1" required aria-label={`${LABELS[key]} wasted`} value={wasted[key]} onChange={(event) => setWasted({ ...wasted, [key]: Number(event.target.value) })} />
      </div>)}
      <p className="kitchen-footnote">Zero is valid when no food was prepared. Waste cannot exceed the cooked count.</p>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
        <ActionButton busy={busy} busyLabel="Saving…" type="submit" disabled={invalid || !date || date > today}>Save kitchen count</ActionButton>
      </div>
    </form>
  </Modal>;
}
