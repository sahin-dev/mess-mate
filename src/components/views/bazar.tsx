"use client";

import {
  CalendarDays,
  Check,
  ImageIcon,
  PackageCheck,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { downloadCsv, formatDate, formatMoney, pluralize } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { BazarEntry } from "@/lib/types";
import { ActionButton, Avatar, EmptyState, Modal, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const ROSTER_LABEL: Record<string, string> = {
  alternate: "Every other day",
  daily: "Every day",
  weekly: "Once a week",
  custom: "Custom schedule",
};

export function BazarView({ onAddBazar }: { onAddBazar: () => void }) {
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [receipt, setReceipt] = useState<BazarEntry | null>(null);

  const memberById = new Map(data.members.map((member) => [member.id, member]));
  const search = query.trim().toLowerCase();
  const entries = data.bazar.filter((entry) => {
    const haystack = `${entry.by} ${entry.items.map((item) => item.name).join(" ")}`.toLowerCase();
    return (
      (!search || haystack.includes(search)) &&
      (statusFilter === "All" || entry.status === statusFilter)
    );
  });

  const pending = data.bazar.filter((entry) => entry.status === "Pending");
  const myEntries = data.bazar.filter((entry) => entry.memberId === data.workspace.userId);

  const exportBazar = () =>
    downloadCsv(`messmate-bazar-${data.period}.csv`, [
      ["Date", "Member", "Items", "Amount", "Status", "Receipt"],
      ...data.bazar.map((entry) => [
        entry.date,
        entry.by,
        entry.items.map((item) => `${item.name}${item.quantity ? ` (${item.quantity})` : ""}`).join("; "),
        entry.amount,
        entry.status,
        entry.hasProof ? "Yes" : "No",
      ]),
    ]);

  const removeEntry = (entry: BazarEntry) =>
    confirm({
      title: "Remove this bazar entry?",
      message: `${formatMoney(entry.amount)} from ${entry.by} on ${formatDate(entry.date)} will be deleted. This also changes the meal rate for ${periodLabel(data.period)}.`,
      confirmLabel: "Remove entry",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteBazar", { id: entry.id }, "Bazar entry removed.");
      },
    });

  return (
    <>
      <SectionHeading
        kicker={periodLabel(data.period).toUpperCase()}
        title="Bazar ledger"
        description="Every grocery run, in one transparent place."
        action={
          <button className="button button-coral" onClick={onAddBazar}>
            <Plus size={17} aria-hidden="true" /> Add bazar
          </button>
        }
      />

      <section className="bazar-stats">
        <div>
          <span className="stat-icon" aria-hidden="true">
            <ShoppingBasket size={20} />
          </span>
          <p>Approved bazar</p>
          <strong>{formatMoney(data.settlement.bazarTotal)}</strong>
          <small>{pluralize(data.bazar.length, "entry", "entries")} this month</small>
        </div>
        <div>
          <span className="stat-icon blue" aria-hidden="true">
            <PackageCheck size={20} />
          </span>
          <p>Awaiting approval</p>
          <strong>{formatMoney(data.settlement.pendingBazarTotal)}</strong>
          <small>
            {pending.length === 0
              ? "Nothing to review"
              : `${pluralize(pending.length, "entry", "entries")} to review`}
          </small>
        </div>
        <div>
          <span className="stat-icon gold" aria-hidden="true">
            <CalendarDays size={20} />
          </span>
          <p>Your contribution</p>
          <strong>
            {formatMoney(
              myEntries
                .filter((entry) => entry.status === "Approved")
                .reduce((sum, entry) => sum + entry.amount, 0),
            )}
          </strong>
          <small>{pluralize(myEntries.length, "run")} by you</small>
        </div>
      </section>

      <div className="split-view">
        <section className="panel ledger-card">
          <div className="table-toolbar">
            <div>
              <h3>Bazar entries</h3>
              <p>
                {isManager
                  ? "Approve an entry to count it towards the meal rate."
                  : "Only approved entries count towards the meal rate."}
              </p>
            </div>
            <div className="view-actions">
              <label className="search-box">
                <Search size={15} aria-hidden="true" />
                <span className="visually-hidden">Search bazar entries</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search items or people"
                  type="search"
                />
              </label>
              <label className="filter-button">
                <span className="visually-hidden">Filter by status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option>All</option>
                  <option>Pending</option>
                  <option>Approved</option>
                </select>
              </label>
              <button className="filter-button" onClick={exportBazar} disabled={!data.bazar.length}>
                Export
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <EmptyState
              icon={<ShoppingBasket size={22} aria-hidden="true" />}
              title={data.bazar.length === 0 ? "No bazar yet" : "Nothing matches"}
              message={
                data.bazar.length === 0
                  ? `Add the first grocery run for ${periodLabel(data.period)} to start the meal rate.`
                  : "Try a different search or clear the status filter."
              }
              action={
                data.bazar.length === 0 ? (
                  <button className="button button-dark" onClick={onAddBazar}>
                    <Plus size={16} aria-hidden="true" /> Add bazar
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="ledger-list">
              {entries.map((entry) => {
                const member = memberById.get(entry.memberId);
                const mine = entry.memberId === data.workspace.userId;
                return (
                  <li className="ledger-row" key={entry.id}>
                    <Avatar name={entry.by} color={member?.color ?? "#3f6b80"} size="sm" avatarId={member?.avatarId} />
                    <div className="ledger-person">
                      <strong>{mine ? "You" : entry.by}</strong>
                      <small>{formatDate(entry.date)}</small>
                    </div>
                    <p className="ledger-items">
                      {entry.items.map((item) => item.name).join(", ")}
                      {entry.hasProof && (
                        <button
                          type="button"
                          className="receipt-link"
                          onClick={() => setReceipt(entry)}
                        >
                          <ImageIcon size={12} aria-hidden="true" /> Receipt
                        </button>
                      )}
                    </p>
                    <strong className="ledger-amount">{formatMoney(entry.amount)}</strong>
                    <span className={`status-pill ${entry.status.toLowerCase()}`}>{entry.status}</span>
                    <div className="row-actions">
                      {isManager && (
                        <ActionButton
                          busy={false}
                          className="icon-action"
                          title={entry.status === "Pending" ? "Approve this entry" : "Move back to pending"}
                          aria-label={
                            entry.status === "Pending"
                              ? `Approve ${entry.by}'s entry of ${formatMoney(entry.amount)}`
                              : `Reopen ${entry.by}'s entry of ${formatMoney(entry.amount)}`
                          }
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              "toggleBazarStatus",
                              {
                                id: entry.id,
                                status: entry.status === "Pending" ? "Approved" : "Pending",
                              },
                              entry.status === "Pending" ? "Entry approved." : "Entry reopened.",
                            )
                          }
                        >
                          {entry.status === "Pending" ? (
                            <Check size={16} aria-hidden="true" />
                          ) : (
                            <Undo2 size={16} aria-hidden="true" />
                          )}
                        </ActionButton>
                      )}
                      {(isManager || mine) && (
                        <button
                          type="button"
                          className="icon-action danger"
                          disabled={busy}
                          title="Remove this entry"
                          aria-label={`Remove ${entry.by}'s entry of ${formatMoney(entry.amount)}`}
                          onClick={() => removeEntry(entry)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="panel roster-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">BAZAR DUTY</span>
              <h3>Who shops next</h3>
            </div>
          </div>
          <p className="roster-note">
            {ROSTER_LABEL[data.settings.rosterFrequency]} &middot; rotating in join order
          </p>
          {data.roster.length === 0 ? (
            <EmptyState title="No members yet" message="Invite housemates to build a duty roster." />
          ) : (
            <ol className="roster-list">
              {data.roster.map((slot) => {
                const day = new Date(`${slot.date}T12:00:00`);
                const mine = slot.memberId === data.workspace.userId;
                return (
                  <li className={`roster-row ${mine ? "highlighted" : ""}`} key={`${slot.date}-${slot.memberId}`}>
                    <div aria-hidden="true">
                      <span>{day.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}</span>
                      <strong>{day.getDate()}</strong>
                    </div>
                    <Avatar name={slot.name} color={slot.color} size="sm" avatarId={slot.avatarId} />
                    <span>
                      <strong>{mine ? "You" : slot.name.split(" ")[0]}</strong>
                      <small>{formatDate(slot.date, { day: "numeric", month: "short" })}</small>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {isManager && (
            <p className="roster-note">Change the rotation in Mess settings &rarr; Bazar rules.</p>
          )}
        </aside>
      </div>

      {receipt && (
        <Modal
          title="Purchase receipt"
          subtitle={`${receipt.by} · ${formatDate(receipt.date)} · ${formatMoney(receipt.amount)}`}
          onClose={() => setReceipt(null)}
          wide
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the receipt is
              streamed from our own route handler and has no known dimensions. */}
          <img
            className="receipt-image"
            src={`/api/proof?id=${encodeURIComponent(receipt.id)}`}
            alt={`Receipt uploaded by ${receipt.by}`}
          />
          <ul className="receipt-items">
            {receipt.items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name}</span>
                <small>{item.quantity || "—"}</small>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
