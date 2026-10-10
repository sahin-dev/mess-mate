"use client";

import {
  ArrowRight,
  Check,
  FileText,
  Home,
  Lightbulb,
  LockKeyhole,
  Plus,
  ReceiptText,
  Trash2,
  UnlockKeyhole,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { downloadCsv, formatDate, formatMoney, pluralize, signedMoney } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Expense } from "@/lib/types";
import { ActionButton, Avatar, EmptyState, Modal, SectionHeading } from "@/components/ui";
import { usePeriodHref, useWorkspace } from "@/components/workspace-context";

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
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const { settlement } = data;
  const rows = data.expenses.filter((expense) => category === "All" || expense.category === category);
  const total = settlement.bazarTotal + settlement.expenseTotal;
  const settlementIds = new Set(settlement.members.map((member) => member.memberId));
  const settlementMembers = data.members.filter((member) => settlementIds.has(member.id));
  const membersById = new Map(data.members.map((member) => [member.id, member]));
  const closed = data.closure.status === "closed";
  const fixedExpenseTotal = data.expenses
    .filter((expense) => expense.category === "Fixed")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const sharedExpenseTotal = data.expenses
    .filter((expense) => expense.category !== "Fixed")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const myExpenseShare =
    settlementMembers.find((member) => member.id === data.workspace.userId)?.expenseShare ?? 0;

  const exportLedger = () =>
    downloadCsv(`messmate-settlement-${data.period}.csv`, [
      [`MessMate settlement — ${periodLabel(data.period)}`],
      [],
      ["Meal rate", settlement.mealRate, "Total meals", settlement.totalMeals],
      ["Approved bazar", settlement.bazarTotal, "Other bills", settlement.expenseTotal],
      [],
      ["Member", "Meals", "Meal cost", "Bills share", "Paid", "Balance"],
      ...settlementMembers.map((member) => [
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

  const closeMonth = () =>
    confirm({
      title: `Close ${periodLabel(data.period)}?`,
      message:
        "This freezes the meal rate, balances, and settle-up plan. Meals, bazar, and bills in this month cannot change until a manager reopens it.",
      confirmLabel: "Close month",
      onConfirm: async () => {
        await runAction("closeMonth", { closePeriod: data.period }, "Month closed and settlement frozen.");
      },
    });

  const reopenMonth = async () => {
    const result = await runAction(
      "reopenMonth",
      { reopenPeriod: data.period, reason: reopenReason },
      "Month reopened for corrections.",
    );
    if (result) {
      setReopening(false);
      setReopenReason("");
    }
  };

  const generateFixedBills = () =>
    confirm({
      title: `Add fixed bills for ${periodLabel(data.period)}?`,
      message: `${pluralize(data.settings.fixedExpenses.length, "saved bill")} will be added once. Bills already generated for this month are skipped automatically.`,
      confirmLabel: "Add fixed bills",
      onConfirm: async () => {
        await runAction(
          "generateFixedExpenses",
          {},
          "Fixed bills are up to date for this month.",
        );
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
            <div className="view-actions">
              {closed ? (
                <button className="button button-outline" onClick={() => setReopening(true)}>
                  <UnlockKeyhole size={16} aria-hidden="true" /> Reopen month
                </button>
              ) : (
                <>
                  {data.settings.fixedExpenses.length > 0 && (
                    <button className="button button-outline" onClick={generateFixedBills} disabled={busy}>
                      <ReceiptText size={16} aria-hidden="true" /> Add fixed bills
                    </button>
                  )}
                  <button className="button button-outline" onClick={closeMonth} disabled={busy}>
                    <LockKeyhole size={16} aria-hidden="true" /> Close month
                  </button>
                </>
              )}
              <button className="button button-coral" onClick={onAddExpense} disabled={closed}>
                <Plus size={17} aria-hidden="true" /> Add expense
              </button>
            </div>
          ) : undefined
        }
      />

      <section className={`month-state-banner ${closed ? "closed" : "open"}`}>
        <LockKeyhole size={18} aria-hidden="true" />
        <div>
          <strong>{closed ? "Settlement frozen" : "Month is open"}</strong>
          <span>
            {closed
              ? `Closed${data.closure.closedBy ? ` by ${data.closure.closedBy}` : ""}${data.closure.closedAt ? ` on ${formatDate(data.closure.closedAt)}` : ""}. Reopen it to make corrections.`
              : "Balances update as approved bazar, meals, and bills change. Close the month when everything has been reviewed."}
          </span>
        </div>
      </section>

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

      <BillPolicyPanel
        fixedExpenseTotal={fixedExpenseTotal}
        sharedExpenseTotal={sharedExpenseTotal}
        myExpenseShare={myExpenseShare}
        activeMemberCount={settlementMembers.length}
        isManager={isManager}
      />

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

          {settlementMembers.length === 0 ? (
            <EmptyState title="No members yet" message="Invite housemates to start splitting costs." />
          ) : (
            <ul className="balance-list">
              {settlementMembers
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
                          style={{ width: `${balanceWidth(member.balance, settlementMembers)}%` }}
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
                  {settlement.transfers.map((transfer) => {
                    const canUpdate =
                      isManager ||
                      transfer.fromId === data.workspace.userId ||
                      transfer.toId === data.workspace.userId;
                    const paid = transfer.paymentStatus === "paid";
                    return (
                      <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amount}`} className={paid ? "paid" : ""}>
                        <span>{transfer.from}</span>
                        <ArrowRight size={13} aria-hidden="true" />
                        <span>{transfer.to}</span>
                        <b>{formatMoney(transfer.amount, { decimals: !Number.isInteger(transfer.amount) })}</b>
                        {canUpdate ? (
                          <ActionButton
                            busy={busy}
                            className={`payment-status-button ${paid ? "paid" : ""}`}
                            title={paid ? "Mark this payment as pending again" : "Confirm this payment was made"}
                            onClick={() =>
                              runAction(
                                paid ? "markSettlementUnpaid" : "markSettlementPaid",
                                {
                                  fromId: transfer.fromId,
                                  toId: transfer.toId,
                                  amount: transfer.amount,
                                },
                                paid ? "Payment marked pending." : "Payment marked paid.",
                              )
                            }
                          >
                            <Check size={13} aria-hidden="true" /> {paid ? "Paid" : "Mark paid"}
                          </ActionButton>
                        ) : (
                          <span className={`status-pill ${paid ? "approved" : "pending"}`}>
                            {paid ? "Paid" : "Pending"}
                          </span>
                        )}
                      </li>
                    );
                  })}
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
                isManager && !closed && data.expenses.length === 0 ? (
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
                const shareCount = expense.shares?.length ?? settlementMembers.length;
                const myShare = expense.shares?.find((share) => share.memberId === data.workspace.userId);
                const share =
                  expense.splitMethod === "By room"
                    ? `By room rent · ${pluralize(shareCount, "member")}`
                    : `${formatMoney(expense.amount / Math.max(1, shareCount))} each`;
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
                    {isManager && !closed ? (
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
                    <ExpenseShareDetail
                      expense={expense}
                      membersById={membersById}
                      currentUserId={data.workspace.userId}
                      myShare={myShare?.amount ?? 0}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {reopening && (
        <Modal
          title={`Reopen ${periodLabel(data.period)}`}
          subtitle="The reason is kept in the month audit trail."
          onClose={() => setReopening(false)}
        >
          <label className="field">
            <span>Reason for reopening</span>
            <textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              maxLength={240}
              rows={4}
              placeholder="For example: electricity bill amount was corrected"
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button className="button button-outline" onClick={() => setReopening(false)}>
              Cancel
            </button>
            <ActionButton
              className="button button-coral"
              busy={busy}
              busyLabel="Reopening…"
              disabled={!reopenReason.trim()}
              onClick={reopenMonth}
            >
              Reopen month
            </ActionButton>
          </div>
        </Modal>
      )}
    </>
  );
}

function BillPolicyPanel({
  fixedExpenseTotal,
  sharedExpenseTotal,
  myExpenseShare,
  activeMemberCount,
  isManager,
}: {
  fixedExpenseTotal: number;
  sharedExpenseTotal: number;
  myExpenseShare: number;
  activeMemberCount: number;
  isManager: boolean;
}) {
  const { data } = useWorkspace();
  const periodHref = usePeriodHref();
  const fixedTemplateTotal = data.settings.fixedExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const averageSharedShare = sharedExpenseTotal / Math.max(1, activeMemberCount);

  return (
    <section className="bill-policy-panel" aria-labelledby="bill-policy-title">
      <div className="bill-policy-head">
        <div>
          <span className="section-kicker">BILL RULES</span>
          <h3 id="bill-policy-title">Fixed and shared bills stay visible</h3>
          <p>Templates are reusable; recorded bills are locked into the selected month.</p>
        </div>
        {isManager && (
          <Link className="button button-outline button-tiny" href={periodHref("/settings")}>
            Manage bill templates
          </Link>
        )}
      </div>
      <div className="bill-policy-grid">
        <div>
          <span>Saved fixed bills</span>
          <strong>{formatMoney(fixedTemplateTotal)}</strong>
          <small>{pluralize(data.settings.fixedExpenses.length, "template")} ready to generate monthly</small>
        </div>
        <div>
          <span>Fixed this month</span>
          <strong>{formatMoney(fixedExpenseTotal)}</strong>
          <small>Rent and repeat bills recorded for {periodLabel(data.period)}</small>
        </div>
        <div>
          <span>Shared this month</span>
          <strong>{formatMoney(sharedExpenseTotal)}</strong>
          <small>About {formatMoney(averageSharedShare)} per active member before room-based splits</small>
        </div>
        <div>
          <span>Your bill share</span>
          <strong>{formatMoney(myExpenseShare)}</strong>
          <small>Only your allocated amount is added to your balance</small>
        </div>
      </div>
    </section>
  );
}

function ExpenseShareDetail({
  expense,
  membersById,
  currentUserId,
  myShare,
}: {
  expense: Expense;
  membersById: Map<string, { name: string }>;
  currentUserId: string;
  myShare: number;
}) {
  const shares = expense.shares ?? [];
  if (shares.length === 0) return null;

  const preview = shares.slice(0, 4);
  const remaining = shares.length - preview.length;

  return (
    <div className="expense-share-detail">
      <span>
        {expense.splitMethod === "By room" ? "Room-weighted split" : "Equal split"}
        {myShare > 0 ? ` · your share ${formatMoney(myShare)}` : ""}
      </span>
      <ul>
        {preview.map((share) => {
          const member = membersById.get(share.memberId);
          const mine = share.memberId === currentUserId;
          return (
            <li key={share.memberId} className={mine ? "mine" : ""}>
              {mine ? "You" : member?.name.split(" ")[0] ?? "Member"}
              <b>{formatMoney(share.amount)}</b>
            </li>
          );
        })}
        {remaining > 0 && <li>+{remaining} more</li>}
      </ul>
    </div>
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
