"use client";

import { Download, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useWorkspace, usePeriodHref } from "@/components/workspace-context";
import { SectionHeading } from "@/components/ui";
import { downloadCsv, formatDate, formatMoney } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { MealEntry } from "@/lib/types";

const mealTotal = (entry: MealEntry) => entry.breakfast + entry.lunch + entry.dinner;

export function MonthlyReport() {
  const { data, isManager, switchingPeriod } = useWorkspace();
  const periodHref = usePeriodHref();
  const { settlement } = data;
  const mealRows = Object.entries(data.memberMeals)
    .flatMap(([memberId, entries]) => entries.map((entry) => ({
      ...entry,
      member: data.members.find((member) => member.id === memberId)?.name ?? "Former member",
    })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.member.localeCompare(b.member));
  const spend = settlement.bazarTotal + settlement.expenseTotal;
  const pendingMeals = mealRows.filter((entry) => entry.status === "Pending").length;
  const pendingBazar = data.bazar.filter((entry) => entry.status === "Pending").length;
  const pendingTransfers = settlement.transfers.filter((transfer) => transfer.paymentStatus !== "paid").length;
  const templates = data.settings.fixedExpenses.filter((template) => template.amount > 0);
  const recordedTemplates = new Set(data.expenses.map((expense) => expense.recurringKey));

  const exportAll = () => downloadCsv(`messmate-monthly-report-${data.period}.csv`, [
    ["Monthly report", data.workspace.messName, periodLabel(data.period)],
    ["Scope", isManager ? "All members" : "Your meals and shared finances"],
    [], ["Summary", "BDT"],
    ["Approved bazar", settlement.bazarTotal], ["Shared bills", settlement.expenseTotal],
    ["Total spend", spend], ["Meal count", settlement.totalMeals], ["Meal rate", settlement.mealRate],
    [], ["Meal date", "Member", "Breakfast", "Lunch", "Dinner", "Total", "Status"],
    ...mealRows.map((entry) => [entry.date, entry.member, entry.breakfast, entry.lunch, entry.dinner, mealTotal(entry), entry.status]),
    [], ["Bazar date", "Buyer", "Items", "BDT", "Status"],
    ...data.bazar.map((entry) => [entry.date, entry.by, entry.items.map((item) => `${item.name}${item.quantity ? ` (${item.quantity})` : ""}`).join("; "), entry.amount, entry.status]),
    [], ["Bill date", "Title", "Category", "BDT", "Paid by", "Split"],
    ...data.expenses.map((expense) => [expense.date, expense.title, expense.category, expense.amount, expense.paidBy, expense.splitMethod]),
    [], ["Member", "Meals", "Meal cost", "Bill share", "Paid", "Balance"],
    ...settlement.members.map((position) => [data.members.find((member) => member.id === position.memberId)?.name ?? "Former member", position.meals, position.mealCost, position.expenseShare, position.paid, position.balance]),
    [], ["From", "To", "BDT", "Status"],
    ...settlement.transfers.map((transfer) => [transfer.from, transfer.to, transfer.amount, transfer.paymentStatus ?? "pending"]),
  ]);

  if (switchingPeriod) return <p className="panel loading-panel">Loading the selected month...</p>;

  return <div className="monthly-report">
    <div className="report-screen-heading">
      <SectionHeading kicker={periodLabel(data.period).toUpperCase()} title="Monthly report" description="Meals, bazar, shared bills and settlement in one connected record." action={<div className="view-actions">
        <button className="button button-outline" onClick={exportAll}><Download size={16} aria-hidden="true" /> Download CSV</button>
        <button className="button button-coral" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Save as PDF</button>
      </div>} />
      <p className="report-print-hint">In the print window, select <strong>Save as PDF</strong>. This report is formatted for A4 paper.</p>
    </div>
    <article className="report-paper">
      <header className="report-cover"><span className="section-kicker">MESSMATE / MONTHLY RECORD</span><h2>{data.workspace.messName}</h2><p>{periodLabel(data.period)} · {data.closure.status === "closed" ? "Closed month" : "Live month"}</p></header>
      <div className="report-summary">
        <div><span>Total shared spend</span><strong>{formatMoney(spend)}</strong><small>Approved bazar + recorded bills</small></div>
        <div><span>Food / bazar</span><strong>{formatMoney(settlement.bazarTotal)}</strong><small>Approved purchases</small></div>
        <div><span>Other bills</span><strong>{formatMoney(settlement.expenseTotal)}</strong><small>{data.expenses.length} recorded bills</small></div>
        <div><span>Meal rate</span><strong>{formatMoney(settlement.mealRate, { decimals: true })}</strong><small>{settlement.totalMeals} approved meals</small></div>
      </div>
      {(pendingMeals + pendingBazar + pendingTransfers) > 0 && <section className="report-attention"><strong>Needs attention</strong><span>{pendingMeals} meal entries awaiting approval · {pendingBazar} bazar runs awaiting approval · {pendingTransfers} settlement payments pending</span></section>}

      <ReportSection number="01" label="Spending" title="Where the money went" href={periodHref("/expenses")} link="Manage bills">
        <p className="report-explainer">Approved bazar pays for meals. Other bills are allocated separately using the split recorded with each bill.</p>
        {spend > 0 ? <div className="report-category-list">{settlement.byCategory.filter((category) => category.amount > 0).map((category) => <div key={category.label}><span>{category.label}</span><div className="report-track"><i style={{ width: `${(category.amount / spend) * 100}%` }} /></div><strong>{formatMoney(category.amount)}</strong><small>{Math.round((category.amount / spend) * 100)}%</small></div>)}</div> : <p className="report-empty">No approved spending recorded.</p>}
      </ReportSection>

      <ReportSection number="02" label="Bills" title="Shared bill register" href={periodHref("/expenses")} link="Open expenses">
        {templates.length > 0 && <div className="report-template-list"><strong>Recurring bill checklist</strong>{templates.map((template) => { const recorded = recordedTemplates.has(`${data.period}:${template.id}`); return <span key={template.id} className={recorded ? "recorded" : "missing"}>{recorded ? "✓" : "○"} {template.title} · {formatMoney(template.amount)} · {recorded ? "generated" : "not generated"}</span>; })}</div>}
        <ReportTable columns={["Date", "Bill", "Category", "Paid by", "Split", "Amount"]} rows={data.expenses.map((expense) => [formatDate(expense.date), expense.title, expense.category, expense.paidBy, expense.splitMethod === "By room" ? "By room" : "Equal", formatMoney(expense.amount)])} empty="No shared bills recorded." />
      </ReportSection>

      <ReportSection number="03" label="Food" title="Bazar register" href={periodHref("/bazar")} link="Open bazar">
        <p className="report-explainer">Pending runs are listed for review but excluded from the meal rate. Pending total: {formatMoney(settlement.pendingBazarTotal)}.</p>
        <ReportTable columns={["Date", "Buyer", "Items", "Status", "Amount"]} rows={data.bazar.map((entry) => [formatDate(entry.date), entry.by, entry.items.map((item) => `${item.name}${item.quantity ? ` (${item.quantity})` : ""}`).join(", "), entry.status, formatMoney(entry.amount)])} empty="No bazar runs recorded." />
      </ReportSection>

      <ReportSection number="04" label="Meals" title={isManager ? "All member meals" : "Your meal entries"} href={periodHref("/meals")} link="Open meals">
        <p className="report-explainer">{isManager ? "Every saved member entry appears below." : "Other members' meal entries stay private; settlement totals include everyone's approved meals."} Pending and rejected entries are excluded from the rate.</p>
        <ReportTable columns={["Date", "Member", "Breakfast", "Lunch", "Dinner", "Count", "Status"]} rows={mealRows.map((entry) => [formatDate(entry.date), entry.member, entry.breakfast, entry.lunch, entry.dinner, mealTotal(entry), entry.status])} empty="No meal entries recorded." />
      </ReportSection>

      <ReportSection number="05" label="Settlement" title="How the costs connect" href={periodHref("/expenses")} link="Manage payments">
        <p className="report-explainer">Balance = bazar and bills paid, minus approved meal cost and allocated bill share. Positive balances are owed money.</p>
        <ReportTable columns={["Member", "Meals", "Meal cost", "Bill share", "Paid", "Balance"]} rows={settlement.members.map((position) => [data.members.find((member) => member.id === position.memberId)?.name ?? "Former member", position.meals, formatMoney(position.mealCost), formatMoney(position.expenseShare), formatMoney(position.paid), formatMoney(position.balance, { decimals: true })])} empty="No settlement yet." />
        {settlement.transfers.length > 0 && <div className="report-transfers"><strong>Settle up</strong>{settlement.transfers.map((transfer) => <p key={`${transfer.fromId}-${transfer.toId}-${transfer.amount}`}>{transfer.from} → {transfer.to} <b>{formatMoney(transfer.amount, { decimals: true })}</b> <span>{transfer.paymentStatus === "paid" ? "Paid" : "Pending"}</span></p>)}</div>}
      </ReportSection>
      <footer className="report-footer">MessMate · {data.workspace.messName} · {periodLabel(data.period)} · {isManager ? "All member records" : "Your meals and shared records"}</footer>
    </article>
  </div>;
}

function ReportSection({ number, label, title, href, link, children }: { number: string; label: string; title: string; href: string; link: string; children: ReactNode }) {
  return <section className="report-section"><div className="report-section-head"><div><span>{number} / {label.toUpperCase()}</span><h3>{title}</h3></div><Link href={href}>{link}</Link></div>{children}</section>;
}

function ReportTable({ columns, rows, empty }: { columns: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="report-empty">{empty}</p>;
  return <div className="report-table-scroll"><table className="report-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
