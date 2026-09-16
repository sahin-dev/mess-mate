"use client";

import { Clock3, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatMoney } from "@/lib/format";
import { todayInZone } from "@/lib/timezone";
import type { ExpenseCategory, SplitMethod } from "@/lib/types";
import { ActionButton, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const MAX_PROOF_BYTES = 2 * 1024 * 1024;

export function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const { data, runAction, busy, notify } = useWorkspace();
  const activeMembers = data.members.filter((member) => member.status === "active");
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "Utility" as ExpenseCategory,
    splitMethod: "All members equally" as SplitMethod,
    date: todayInZone(data.settings.timezone),
    paidById: data.workspace.userId,
  });

  const amount = Number(form.amount) || 0;
  const perMember = amount / Math.max(1, activeMembers.length);
  const roomsExist = data.rooms.some((room) => room.rent > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "addExpense",
      { ...form, amount },
      `${form.title} added to the month.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title="Add a shared expense"
      subtitle="Rent, bills and one-off costs. Bazar is recorded separately."
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
            <option disabled={!roomsExist}>By room</option>
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
            {!roomsExist && " Add rooms with rent to enable the by-room split."}
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            busy={busy}
            busyLabel="Adding…"
            type="submit"
            disabled={!form.title.trim() || amount <= 0}
            onClick={() => {
              if (amount > 0 && amount < 1) notify("Amounts under 1 taka are not recorded.", "error");
            }}
          >
            Add expense
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

export function AddBazarModal({ onClose }: { onClose: () => void }) {
  const { data, runAction, busy, notify } = useWorkspace();
  const [items, setItems] = useState([{ name: "", quantity: "" }]);
  const [date, setDate] = useState(todayInZone(data.settings.timezone));
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState<{ name: string; type: string; data: string } | null>(null);

  const total = Number(amount) || 0;
  const needsProof = data.settings.requireProof && !proof;

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
      "addBazar",
      { date, amount: total, items, proof: proof ?? undefined },
      data.settings.bazarApproval ? "Bazar submitted for approval." : "Bazar added.",
    );
    if (result) onClose();
  };

  return (
    <Modal
      title="Add a bazar run"
      subtitle="List what you bought and the total you paid."
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

        <div className={`proof-upload ${proof ? "has-file" : ""}`}>
          <label>
            <ImagePlus size={21} aria-hidden="true" />
            <span>
              <strong>{proof?.name ?? "Attach the receipt"}</strong>
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
          {proof && (
            <button type="button" onClick={() => setProof(null)} aria-label="Remove the attached receipt">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="invite-note">
          <Clock3 size={17} aria-hidden="true" />
          <p>
            {data.settings.bazarApproval
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
            busyLabel="Submitting…"
            type="submit"
            disabled={total <= 0 || !items[0].name.trim()}
          >
            Submit bazar
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
