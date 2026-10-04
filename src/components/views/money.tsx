"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  Building2,
  Bus,
  Download,
  GraduationCap,
  HeartPulse,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  Trash2,
  Utensils,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { downloadCsv, formatDate, formatMoney, signedMoney } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import { todayInZone } from "@/lib/timezone";
import {
  MONEY_ACCOUNTS,
  MONEY_EXPENSE_CATEGORIES,
  MONEY_INCOME_CATEGORIES,
  type MoneyAccount,
  type MoneyCategory,
  type MoneyExpenseCategory,
  type MoneyTransaction,
  type MoneyTransactionType,
} from "@/lib/types";
import { ActionButton, EmptyState, Modal, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const CATEGORY_ICON: Record<string, typeof WalletCards> = {
  Living: Building2,
  "Food & dining": Utensils,
  Transport: Bus,
  Shopping: ShoppingBag,
  Health: HeartPulse,
  Education: GraduationCap,
  Entertainment: Sparkles,
  Family: HeartPulse,
  Salary: Banknote,
  Freelance: BriefcaseBusiness,
  Business: BriefcaseBusiness,
  Gift: Sparkles,
  Other: MoreHorizontal,
};

const BAR_COLORS = ["#c9603f", "#33765f", "#3f6b80", "#a97c31", "#6a66a0", "#8a5570"];

export function MoneyView() {
  const { data, busy, runAction, confirm } = useWorkspace();
  const [editing, setEditing] = useState<MoneyTransaction | "new" | null>(null);
  const [budgetCategory, setBudgetCategory] = useState<MoneyExpenseCategory | null>(null);
  const [kind, setKind] = useState<"All" | MoneyTransactionType>("All");
  const [category, setCategory] = useState("All");
  const { money } = data;

  const categories = useMemo(
    () => [...new Set(money.transactions.map((entry) => entry.category))].sort(),
    [money.transactions],
  );
  const rows = money.transactions.filter(
    (entry) => (kind === "All" || entry.type === kind) && (category === "All" || entry.category === category),
  );
  const largestCategory = Math.max(...money.byCategory.map((entry) => entry.amount), 1);

  const exportTransactions = () =>
    downloadCsv(`money-${data.period}.csv`, [
      ["Date", "Type", "Title", "Category", "Account", "Amount (BDT)", "Source", "Note"],
      ...money.transactions.map((entry) => [
        entry.date,
        entry.type,
        entry.title,
        entry.category,
        entry.account,
        entry.type === "Expense" ? -entry.amount : entry.amount,
        entry.source === "mess" ? "MessMate" : "Personal",
        entry.note,
      ]),
    ]);

  const remove = (entry: MoneyTransaction) =>
    confirm({
      title: "Delete this transaction?",
      message: `${entry.title} (${formatMoney(entry.amount)}) will be removed from your private ledger.`,
      confirmLabel: "Delete transaction",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteMoneyTransaction", { id: entry.id }, "Transaction deleted.");
      },
    });

  return (
    <>
      <SectionHeading
        kicker={`${periodLabel(data.period).toUpperCase()} · PRIVATE`}
        title="My money"
        description="Income, everyday spending, budgets and your real share of mess living costs."
        action={
          <button className="button button-coral" onClick={() => setEditing("new")}>
            <Plus size={17} aria-hidden="true" /> Add transaction
          </button>
        }
      />

      <section className="money-summary-grid" aria-label="Money summary">
        <MoneyMetric
          label="Income"
          value={formatMoney(money.summary.income)}
          detail="Money in this month"
          icon={ArrowDownLeft}
          tone="green"
        />
        <MoneyMetric
          label="Spent"
          value={formatMoney(money.summary.expenses)}
          detail={`${formatMoney(money.summary.livingExpenses)} is living`}
          icon={ArrowUpRight}
          tone="coral"
        />
        <MoneyMetric
          label="Net cash flow"
          value={signedMoney(money.summary.net)}
          detail={
            money.summary.savingsRate === null
              ? "Add income to see your savings rate"
              : `${Math.round(money.summary.savingsRate)}% savings rate`
          }
          icon={WalletCards}
          tone="blue"
        />
        <MoneyMetric
          label="Budget left"
          value={money.summary.budget ? signedMoney(money.summary.budgetRemaining) : "—"}
          detail={money.summary.budget ? `of ${formatMoney(money.summary.budget)}` : "No budgets set yet"}
          icon={PiggyBank}
          tone="gold"
        />
      </section>

      <div className="money-layout">
        <section className="panel money-transactions">
          <div className="table-toolbar money-toolbar">
            <div>
              <h3>Transactions</h3>
              <p>Your entries and automatic mess costs in one ledger</p>
            </div>
            <div className="money-filters">
              <label className="filter-button">
                <span className="visually-hidden">Filter transaction type</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  <option>All</option>
                  <option>Income</option>
                  <option>Expense</option>
                </select>
              </label>
              <label className="filter-button">
                <span className="visually-hidden">Filter category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>All</option>
                  {categories.map((entry) => <option key={entry}>{entry}</option>)}
                </select>
              </label>
              <button className="filter-button" onClick={exportTransactions} disabled={!money.transactions.length}>
                <Download size={14} aria-hidden="true" /> Export
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={22} aria-hidden="true" />}
              title={money.transactions.length ? "No matching transactions" : "Your ledger is ready"}
              message={
                money.transactions.length
                  ? "Change the filters to see more transactions."
                  : "Add income or personal spending. Mess costs will appear automatically as they are recorded."
              }
              action={!money.transactions.length ? (
                <button className="button button-dark" onClick={() => setEditing("new")}>
                  <Plus size={16} aria-hidden="true" /> Add your first transaction
                </button>
              ) : undefined}
            />
          ) : (
            <ul className="money-transaction-list">
              {rows.map((entry) => {
                const Icon = CATEGORY_ICON[entry.category] ?? MoreHorizontal;
                const automatic = entry.source === "mess";
                return (
                  <li key={entry.id}>
                    <span className={`money-category-icon ${entry.type.toLowerCase()}`} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <div className="money-transaction-copy">
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.category} · {entry.account} · {formatDate(entry.date, { day: "numeric", month: "short" })}
                      </small>
                      {entry.note && <p>{entry.note}</p>}
                    </div>
                    {automatic && (
                      <span className="automatic-badge" title="Calculated from your mess activity">
                        <LockKeyhole size={12} aria-hidden="true" /> Automatic
                      </span>
                    )}
                    <strong className={entry.type === "Income" ? "money-in" : "money-out"}>
                      {entry.type === "Income" ? "+" : "−"}{formatMoney(entry.amount)}
                    </strong>
                    <div className="money-row-actions">
                      {!automatic && (
                        <>
                          <button
                            className="icon-action"
                            aria-label={`Edit ${entry.title}`}
                            title={`Edit ${entry.title}`}
                            onClick={() => setEditing(entry)}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            className="icon-action danger"
                            aria-label={`Delete ${entry.title}`}
                            title={`Delete ${entry.title}`}
                            disabled={busy}
                            onClick={() => remove(entry)}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="money-side-stack">
          <section className="panel money-breakdown">
            <div className="panel-heading money-panel-heading">
              <div>
                <h3>Spending by category</h3>
                <p>Where your money went</p>
              </div>
            </div>
            {money.byCategory.length ? (
              <ul>
                {money.byCategory.map((entry, index) => (
                  <li key={entry.category}>
                    <div>
                      <span><i style={{ background: BAR_COLORS[index % BAR_COLORS.length] }} />{entry.category}</span>
                      <strong>{formatMoney(entry.amount)}</strong>
                    </div>
                    <span className="money-bar" aria-hidden="true">
                      <i style={{ width: `${(entry.amount / largestCategory) * 100}%`, background: BAR_COLORS[index % BAR_COLORS.length] }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="money-side-empty">Spending categories will appear here.</p>
            )}
          </section>

          <section className="panel money-budgets">
            <div className="panel-heading money-panel-heading">
              <div>
                <h3>Monthly budgets</h3>
                <p>Limits reset with each month</p>
              </div>
              <button className="subtle-button" onClick={() => setBudgetCategory("Living")}>
                <Plus size={14} aria-hidden="true" /> Set budget
              </button>
            </div>
            {money.budgets.length ? (
              <ul>
                {money.budgets.map((budget) => {
                  const percent = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
                  return (
                    <li key={budget.category}>
                      <button onClick={() => setBudgetCategory(budget.category)} aria-label={`Edit ${budget.category} budget`}>
                        <span><strong>{budget.category}</strong><small>{formatMoney(budget.spent)} of {formatMoney(budget.amount)}</small></span>
                        <b className={percent > 100 ? "over" : ""}>{Math.round(percent)}%</b>
                      </button>
                      <span className={`budget-bar ${percent > 100 ? "over" : ""}`} aria-hidden="true">
                        <i style={{ width: `${Math.min(percent, 100)}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="money-side-empty">
                <p>Set category limits to see progress as you spend.</p>
                <button className="button button-outline" onClick={() => setBudgetCategory("Living")}>Set a budget</button>
              </div>
            )}
          </section>

          <div className="money-privacy-note">
            <LockKeyhole size={18} aria-hidden="true" />
            <p><strong>Your ledger is private.</strong> Housemates and mess managers cannot see personal transactions or budgets.</p>
          </div>
        </aside>
      </div>

      {editing && <TransactionModal transaction={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {budgetCategory && <BudgetModal category={budgetCategory} onClose={() => setBudgetCategory(null)} />}
    </>
  );
}

function MoneyMetric({ label, value, detail, icon: Icon, tone }: {
  label: string; value: string; detail: string; icon: typeof WalletCards; tone: string;
}) {
  return (
    <article className="panel money-metric">
      <span className={`metric-icon ${tone}`}><Icon size={18} aria-hidden="true" /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function TransactionModal({ transaction, onClose }: { transaction: MoneyTransaction | null; onClose: () => void }) {
  const { data, busy, runAction } = useWorkspace();
  const [form, setForm] = useState({
    type: transaction?.type ?? "Expense" as MoneyTransactionType,
    title: transaction?.title ?? "",
    amount: transaction ? String(transaction.amount) : "",
    date: transaction?.date ?? todayInZone(data.settings.timezone),
    category: transaction?.category ?? "Living" as MoneyCategory,
    account: (transaction?.account === "MessMate" ? "Cash" : transaction?.account) ?? "Cash" as MoneyAccount,
    note: transaction?.note ?? "",
  });
  const categories = form.type === "Income" ? MONEY_INCOME_CATEGORIES : MONEY_EXPENSE_CATEGORIES;
  const amount = Number(form.amount) || 0;
  const changeType = (type: MoneyTransactionType) => setForm({
    ...form,
    type,
    category: type === "Income" ? "Salary" : "Living",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      transaction ? "updateMoneyTransaction" : "addMoneyTransaction",
      { ...form, amount, id: transaction?.id },
      transaction ? "Transaction updated." : "Transaction added.",
    );
    if (result) onClose();
  };
  return (
    <Modal
      title={transaction ? "Edit transaction" : "Add a transaction"}
      subtitle="Only you can see the entries you add here."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="segmented-control" role="group" aria-label="Transaction type">
          {(["Expense", "Income"] as const).map((type) => (
            <button key={type} type="button" className={form.type === type ? "active" : ""} onClick={() => changeType(type)}>
              {type === "Expense" ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}{type}
            </button>
          ))}
        </div>
        <label>
          What was it for?
          <input autoFocus required maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={form.type === "Income" ? "e.g. Monthly salary" : "e.g. Bus fare"} />
        </label>
        <div className="form-grid">
          <label>Amount (৳)<input type="number" min="0.01" max="10000000" step="0.01" inputMode="decimal" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" /></label>
          <label>Date<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        </div>
        <div className="form-grid">
          <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as MoneyCategory })}>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label>Account<select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value as MoneyAccount })}>{MONEY_ACCOUNTS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        </div>
        <label>Note <span className="optional-label">Optional</span><textarea maxLength={300} rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Anything you want to remember" /></label>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit" disabled={!form.title.trim() || amount <= 0}>Save transaction</ActionButton>
        </div>
      </form>
    </Modal>
  );
}

function BudgetModal({ category: initialCategory, onClose }: { category: MoneyExpenseCategory; onClose: () => void }) {
  const { data, busy, runAction } = useWorkspace();
  const [category, setCategory] = useState(initialCategory);
  const current = data.money.budgets.find((entry) => entry.category === category);
  const [amount, setAmount] = useState(() => String(data.money.budgets.find((entry) => entry.category === initialCategory)?.amount ?? ""));
  const changeCategory = (next: MoneyExpenseCategory) => {
    setCategory(next);
    setAmount(String(data.money.budgets.find((entry) => entry.category === next)?.amount ?? ""));
  };
  const numericAmount = Number(amount) || 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction("setMoneyBudget", { category, amount: numericAmount }, numericAmount ? `${category} budget saved.` : `${category} budget removed.`);
    if (result) onClose();
  };
  return (
    <Modal title="Set a monthly budget" subtitle={`Plan your spending for ${periodLabel(data.period)}.`} onClose={onClose}>
      <form onSubmit={submit}>
        <label>Category<select value={category} onChange={(event) => changeCategory(event.target.value as MoneyExpenseCategory)}>{MONEY_EXPENSE_CATEGORIES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <label>Monthly limit (৳)<input autoFocus type="number" min="0" max="10000000" step="0.01" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label>
        <div className="invite-note"><PiggyBank size={17} aria-hidden="true" /><p>{current ? `${formatMoney(current.spent)} spent against the current ${formatMoney(current.amount)} limit. Enter 0 to remove it.` : "This limit applies only to the selected month. Your actual spending is never blocked."}</p></div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>Cancel</button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit">Save budget</ActionButton>
        </div>
      </form>
    </Modal>
  );
}
