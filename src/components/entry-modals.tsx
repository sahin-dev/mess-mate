"use client";

import { Clock3, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import { todayInZone } from "@/lib/timezone";
import type { BazarEntry, Expense, ExpenseCategory, SplitMethod } from "@/lib/types";
import { ActionButton, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/** Adds a shared bill, or edits one when `expense` is given. */
export function AddExpenseModal({ onClose, expense }: { onClose: () => void; expense?: Expense }) {
  const { data, runAction, busy, notify } = useWorkspace();
  const editing = Boolean(expense);
  const activeMembers = data.members.filter(
    (member) => member.status === "active" || member.id === expense?.paidById,
  );
  const [form, setForm] = useState({
    title: expense?.title ?? "",
    amount: expense ? String(expense.amount) : "",
    category: (expense?.category ?? "Utility") as ExpenseCategory,
    splitMethod: (expense?.splitMethod ?? "All members equally") as SplitMethod,
    date: expense?.date ?? todayInZone(data.settings.timezone),
    paidById: expense?.paidById ?? data.workspace.userId,
  });
  const [repeatMonthly, setRepeatMonthly] = useState(false);

  const amount = Number(form.amount) || 0;
  const perMember = amount / Math.max(1, activeMembers.length);
  const rentByRoom = new Map(data.rooms.map((room) => [room.id, room.rent]));
  const rentedRoomsExist = data.rooms.some((room) => room.rent > 0);
  // The by-room split divides a bill by what each member pays in rent, so it
  // needs someone active actually living in a room that charges rent. Without
  // that the settlement falls back to an equal split, which is not what the
  // option promises, so the option stays out of reach until it can work.
  const roomSplitWorks = activeMembers.some(
    (member) => member.roomId && (rentByRoom.get(member.roomId) ?? 0) > 0,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      editing ? "updateExpense" : "addExpense",
      { ...form, amount, id: expense?.id, repeatMonthly },
      editing ? `${form.title} updated and re-split.` : `${form.title} added to the month.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={editing ? "Edit shared expense" : "Add a shared expense"}
      subtitle={
        editing
          ? "Saving recalculates everyone's share for the new amount and date."
          : "Rent, bills and one-off costs. Bazar is recorded separately."
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          What was it for?
          <input
            autoFocus
            required
            maxLength={100}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="e.g. Electricity bill"
          />
        </label>

        <div className="form-grid">
          <label>
            Amount (&#2547;)
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="0"
              inputMode="decimal"
            />
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Category
            <select
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as ExpenseCategory })
              }
            >
              <option>Utility</option>
              <option>Fixed</option>
              <option>Maintenance</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Who paid?
            <select
              value={form.paidById}
              onChange={(event) => setForm({ ...form, paidById: event.target.value })}
            >
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.id === data.workspace.userId ? `${member.name} (you)` : member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          How should it be split?
          <select
            value={form.splitMethod}
            onChange={(event) =>
              setForm({ ...form, splitMethod: event.target.value as SplitMethod })
            }
          >
            <option>All members equally</option>
            <option disabled={!roomSplitWorks}>By room</option>
          </select>
        </label>

        <div className="invite-note">
          <Clock3 size={17} aria-hidden="true" />
          <p>
            {form.splitMethod === "By room"
              ? "Each member pays in proportion to their share of the rent. Members without a room pay nothing towards this."
              : amount > 0
                ? `${formatMoney(perMember)} each, across ${activeMembers.length} active members.`
                : `Divided equally between ${activeMembers.length} active members.`}
            {!roomSplitWorks &&
              (rentedRoomsExist
                ? " Move members into rooms to enable the by-room split."
                : " Add rooms with rent, and move members into them, to enable the by-room split.")}
          </p>
        </div>

        {!editing && form.category === "Fixed" && (
          <label className="recurring-choice">
            <input
              type="checkbox"
              checked={repeatMonthly}
              onChange={(event) => setRepeatMonthly(event.target.checked)}
            />
            <span>
              <strong>Repeat this bill every month</strong>
              <small>
                Add this month now and save a recurring bill for future open months. You can edit
                the saved rule in Settings.
              </small>
            </span>
          </label>
        )}
        {editing && expense?.recurringKey && (
          <p className="recurring-edit-note">This changes this month&rsquo;s bill only. Edit the recurring rule in Settings for future months.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            busy={busy}
            busyLabel={editing ? "Saving…" : "Adding…"}
            type="submit"
            disabled={!form.title.trim() || amount <= 0}
            onClick={() => {
              if (amount > 0 && amount < 1) notify("Amounts under 1 taka are not recorded.", "error");
            }}
          >
            {editing ? "Save changes" : "Add expense"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

/** Adds a bazar run, or edits one when `entry` is given. */
export function AddBazarModal({ onClose, entry }: { onClose: () => void; entry?: BazarEntry }) {
  const { data, runAction, busy, notify, isManager } = useWorkspace();
  const editing = Boolean(entry);
  const activeMembers = data.members.filter((member) => member.status === "active");
  // A manager often records the run someone else did and was paid back for.
  const [buyerId, setBuyerId] = useState(entry?.memberId ?? data.workspace.userId);
  const [items, setItems] = useState(
    entry?.items.length ? entry.items.map((item) => ({ ...item })) : [{ name: "", quantity: "" }],
  );
  const [date, setDate] = useState(entry?.date ?? todayInZone(data.settings.timezone));
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [proof, setProof] = useState<{ name: string; type: string; data: string } | null>(null);
  // An entry being edited may already have a receipt on file.
  const [keepExistingProof, setKeepExistingProof] = useState(Boolean(entry?.hasProof));

  const total = Number(amount) || 0;
  const needsProof = data.settings.requireProof && !proof && !keepExistingProof;
  const resubmits = editing && !isManager && data.settings.bazarApproval;

  const pickProof = (file: File | undefined) => {
    if (!file) {
      setProof(null);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      notify("Receipts must be a PNG, JPG or WebP image.", "error");
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      notify("That image is over 2 MB. Try a smaller photo.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => notify("That image could not be read.", "error");
    reader.onload = () => setProof({ name: file.name, type: file.type, data: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (needsProof) {
      notify("This mess requires a receipt photo.", "error");
      return;
    }
    const result = await runAction(
      editing ? "updateBazar" : "addBazar",
      {
        id: entry?.id,
        date,
        amount: total,
        items,
        proof: proof ?? undefined,
        removeProof: editing && !proof && !keepExistingProof,
        memberId: buyerId,
      },
      editing
        ? resubmits
          ? "Changes saved and sent back for approval."
          : "Bazar entry updated."
        : data.settings.bazarApproval
          ? "Bazar submitted for approval."
          : "Bazar added.",
    );
    if (result) onClose();
  };

  const proofLabel = proof?.name ?? (keepExistingProof ? (entry?.proofName ?? "Receipt on file") : null);

  return (
    <Modal
      title={editing ? "Edit bazar entry" : "Add a bazar run"}
      subtitle={editing ? "Correct the items, the total or the date." : "List what you bought and the total you paid."}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              required
              max={todayInZone(data.settings.timezone)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Total paid (&#2547;)
            <input
              type="number"
              min="1"
              step="0.01"
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        {isManager && activeMembers.length > 1 && (
          <label>
            Who bought this?
            <select value={buyerId} onChange={(event) => setBuyerId(event.target.value)}>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.id === data.workspace.userId ? `${member.name} (you)` : member.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="item-fieldset">
          <legend>Items</legend>
          <div className="item-inputs">
            {items.map((item, index) => (
              <div key={index}>
                <input
                  required
                  maxLength={80}
                  placeholder="Item"
                  aria-label={`Item ${index + 1} name`}
                  value={item.name}
                  onChange={(event) =>
                    setItems(
                      items.map((entry, position) =>
                        position === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <input
                  maxLength={40}
                  placeholder="Quantity"
                  aria-label={`Item ${index + 1} quantity`}
                  value={item.quantity}
                  onChange={(event) =>
                    setItems(
                      items.map((entry, position) =>
                        position === index ? { ...entry, quantity: event.target.value } : entry,
                      ),
                    )
                  }
                />
                {items.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => setItems(items.filter((_, position) => position !== index))}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="add-inline"
            onClick={() => setItems([...items, { name: "", quantity: "" }])}
            disabled={items.length >= 30}
          >
            <Plus size={15} aria-hidden="true" /> Add another item
          </button>
        </fieldset>

        <div className={`proof-upload ${proofLabel ? "has-file" : ""}`}>
          <label>
            <ImagePlus size={21} aria-hidden="true" />
            <span>
              <strong>{proofLabel ?? "Attach the receipt"}</strong>
              <small>
                {data.settings.requireProof ? "Required by your mess" : "Optional"} &middot; PNG, JPG
                or WebP up to 2 MB
              </small>
            </span>
            <input
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => pickProof(event.target.files?.[0])}
            />
          </label>
          {proofLabel && (
            <button
              type="button"
              onClick={() => {
                setProof(null);
                setKeepExistingProof(false);
              }}
              aria-label="Remove the attached receipt"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="invite-note">
          <Clock3 size={17} aria-hidden="true" />
          <p>
            {buyerId !== data.workspace.userId &&
              `Recorded as bought by ${activeMembers.find((m) => m.id === buyerId)?.name}, so they are credited for it. `}
            {resubmits
              ? "Saving sends this entry back to a manager for approval."
              : editing
                ? "The meal rate updates as soon as you save."
                : data.settings.bazarApproval
                  ? "A manager reviews this before it counts towards the meal rate."
                  : "This counts towards the meal rate straight away."}
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            busy={busy}
            busyLabel={editing ? "Saving…" : "Submitting…"}
            type="submit"
            disabled={total <= 0 || !items[0].name.trim()}
          >
            {editing ? "Save changes" : "Submit bazar"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
