"use client";

import {
  ArrowRight,
  Check,
  FileText,
  Home,
  Lightbulb,
  Plus,
  ReceiptText,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { downloadCsv, formatDate, formatMoney, pluralize, signedMoney } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Expense } from "@/lib/types";
import { Avatar, EmptyState, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const CATEGORY_ICON = {
  Fixed: Home,
  Utility: Zap,
  Maintenance: Lightbulb,
  Other: ReceiptText,
} as const;

const CATEGORY_TONE = {
  Fixed: "sage",
  Utility: "sand",
  Maintenance: "blue",
  Other: "rose",
} as const;

const SLICE_COLORS = ["#c9603f", "#b08a3d", "#4c7f6c", "#3f6b80", "#6a66a0", "#8a8f8b"];

export function ExpensesView({ onAddExpense }: { onAddExpense: () => void }) {
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
  const [category, setCategory] = useState("All");

  const { settlement } = data;
  const rows = data.expenses.filter((expense) => category === "All" || expense.category === category);
  const total = settlement.bazarTotal + settlement.expenseTotal;
  const activeMembers = data.members.filter((member) => member.status === "active");

  const exportLedger = () =>
    downloadCsv(`messmate-settlement-${data.period}.csv`, [
      [`MessMate settlement — ${periodLabel(data.period)}`],
      [],
      ["Meal rate", settlement.mealRate, "Total meals", settlement.totalMeals],
      ["Approved bazar", settlement.bazarTotal, "Other bills", settlement.expenseTotal],
      [],
      ["Member", "Meals", "Meal cost", "Bills share", "Paid", "Balance"],
      ...activeMembers.map((member) => [
        member.name,
        member.meals,
        member.mealCost,
        member.expenseShare,
        member.paid,
        member.balance,
      ]),
      [],
      ["Expense", "Category", "Date", "Amount", "Split", "Paid by"],
      ...data.expenses.map((expense) => [
        expense.title,
        expense.category,
        expense.date,
        expense.amount,
        expense.splitMethod,
        expense.paidBy,
      ]),
      [],
      ["Settle up", "", "", "", "", ""],
      ...settlement.transfers.map((transfer) => [transfer.from, "pays", transfer.to, transfer.amount, "", ""]),
    ]);

  const removeExpense = (expense: Expense) =>
    confirm({
      title: "Delete this expense?",
      message: `${expense.title} (${formatMoney(expense.amount)}) will be removed from ${periodLabel(data.period)} and every member's share recalculated.`,
      confirmLabel: "Delete expense",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteExpense", { id: expense.id }, "Expense deleted.");
      },
    });

  return (
    <>
      <SectionHeading
        kicker={periodLabel(data.period).toUpperCase()}
        title="Expenses & settlement"
        description="Shared costs, each member's share, and what it takes to square up."
        action={
          isManager ? (
            <button className="button button-coral" onClick={onAddExpense}>
              <Plus size={17} aria-hidden="true" /> Add expense
            </button>
          ) : undefined
        }
      />

      <section className="expense-hero">
        <div>
          <span>Total mess spend</span>
          <strong>{formatMoney(total)}</strong>
          <small>
            {settlement.mealRate > 0
              ? `${formatMoney(settlement.mealRate, { decimals: true })} per meal across ${settlement.totalMeals} meals`
              : "Approve some bazar to work out the meal rate"}
          </small>
        </div>
        <SpendDonut slices={settlement.byCategory} total={total} />
        <ul className="expense-legend">
          {settlement.byCategory.map((slice, index) => (
            <li key={slice.label}>
              <i style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }} aria-hidden="true" />
              {slice.label}
              <b>{formatMoney(slice.amount)}</b>
            </li>
          ))}
          {settlement.byCategory.length === 0 && <li className="legend-empty">Nothing recorded yet</li>}
        </ul>
      </section>

      <div className="settlement-grid">
        <section className="panel balances-card">
          <div className="table-toolbar">
            <div>
              <h3>Where everyone stands</h3>
              <p>Paid, minus meals eaten and their share of the bills</p>
            </div>
            <button className="filter-button" onClick={exportLedger}>
              <FileText size={14} aria-hidden="true" /> Export settlement
            </button>
          </div>

          {activeMembers.length === 0 ? (
            <EmptyState title="No members yet" message="Invite housemates to start splitting costs." />
          ) : (
            <ul className="balance-list">
              {activeMembers
                .slice()
                .sort((a, b) => b.balance - a.balance)
                .map((member) => {
                  const mine = member.id === data.workspace.userId;
                  return (
                    <li key={member.id} className={mine ? "mine" : ""}>
                      <Avatar name={member.name} color={member.color} size="sm" avatarId={member.avatarId} />
                      <div className="balance-person">
                        <strong>{mine ? "You" : member.name}</strong>
                        <small>
                          {pluralize(member.meals, "meal")} &middot; paid {formatMoney(member.paid)}
                        </small>
                      </div>
                      <div className="balance-bar" aria-hidden="true">
                        <span
                          className={member.balance >= 0 ? "credit" : "debt"}
                          style={{ width: `${balanceWidth(member.balance, activeMembers)}%` }}
                        />
                      </div>
                      <strong
                        className={member.balance > 0 ? "positive-text" : member.balance < 0 ? "negative-text" : ""}
                      >
                        {signedMoney(member.balance)}
                      </strong>
                    </li>
                  );
                })}
            </ul>
          )}

          <div className="settle-strip">
            {settlement.transfers.length === 0 ? (
              <p>
                <Check size={15} aria-hidden="true" /> Everyone is square for {periodLabel(data.period)}.
              </p>
            ) : (
              <>
                <h4>To settle {periodLabel(data.period)}</h4>
                <ul>
                  {settlement.transfers.map((transfer) => (
                    <li key={`${transfer.fromId}-${transfer.toId}`}>
                      <span>{transfer.from}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                      <span>{transfer.to}</span>
                      <b>{formatMoney(transfer.amount)}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <section className="panel expense-list-card">
          <div className="table-toolbar">
            <div>
              <h3>Shared bills</h3>
              <p>
                {pluralize(data.expenses.length, "bill")} &middot; {formatMoney(settlement.expenseTotal)}{" "}
                excluding bazar
              </p>
            </div>
            <label className="filter-button">
              <span className="visually-hidden">Filter by category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>All</option>
                <option>Fixed</option>
                <option>Utility</option>
                <option>Maintenance</option>
                <option>Other</option>
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={22} aria-hidden="true" />}
              title={data.expenses.length === 0 ? "No bills yet" : "Nothing in this category"}
              message={
                data.expenses.length === 0
                  ? "Record rent, electricity or maintenance so they are divided automatically."
                  : "Choose a different category to see more."
              }
              action={
                isManager && data.expenses.length === 0 ? (
                  <button className="button button-dark" onClick={onAddExpense}>
                    <Plus size={16} aria-hidden="true" /> Add the first bill
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="expense-list">
              {rows.map((expense) => {
                const Icon = CATEGORY_ICON[expense.category];
                const share =
                  expense.splitMethod === "By room"
                    ? "Split by room rent"
                    : `${formatMoney(expense.amount / Math.max(1, activeMembers.length))} each`;
                return (
                  <li className="expense-row" key={expense.id}>
                    <span className={`metric-icon ${CATEGORY_TONE[expense.category]}`} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <div>
                      <strong>{expense.title}</strong>
                      <small>
                        {expense.category} &middot; {formatDate(expense.date, { day: "numeric", month: "short" })}{" "}
                        &middot; paid by {expense.paidById === data.workspace.userId ? "you" : expense.paidBy}
                      </small>
                    </div>
                    <span className="share-badge">{share}</span>
                    <strong className="expense-amount">{formatMoney(expense.amount)}</strong>
                    {isManager ? (
                      <button
                        type="button"
                        className="icon-action danger"
                        disabled={busy}
                        title={`Delete ${expense.title}`}
                        aria-label={`Delete ${expense.title}`}
                        onClick={() => removeExpense(expense)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** Widths are relative to the largest absolute balance, so the bars stay comparable. */
function balanceWidth(balance: number, members: { balance: number }[]) {
  const max = Math.max(...members.map((member) => Math.abs(member.balance)), 1);
  return Math.max(3, (Math.abs(balance) / max) * 100);
}

function SpendDonut({ slices, total }: { slices: { label: string; amount: number }[]; total: number }) {
  if (total <= 0) {
    return (
      <div className="donut donut-empty" aria-hidden="true">
        <div>
          <span>0%</span>
          <small>No spend</small>
        </div>
      </div>
    );
  }
  // Running totals first, so each stop is computed from data rather than from a
  // variable mutated during the map.
  const offsets = slices.reduce<number[]>(
    (running, slice) => [...running, running[running.length - 1] + slice.amount],
    [0],
  );
  const stops = slices.map((slice, index) => {
    const start = (offsets[index] / total) * 100;
    const end = (offsets[index + 1] / total) * 100;
    return `${SLICE_COLORS[index % SLICE_COLORS.length]} ${start}% ${end}%`;
  });
  const largest = slices[0];
  return (
    <div
      className="donut"
      style={{ background: `conic-gradient(${stops.join(",")})` }}
      role="img"
      aria-label={slices.map((slice) => `${slice.label} ${formatMoney(slice.amount)}`).join(", ")}
    >
      <div>
        <span>{Math.round((largest.amount / total) * 100)}%</span>
        <small>{largest.label}</small>
      </div>
    </div>
  );
}
