"use client";

import { Bath, Home, Pencil, Plus, Trash2, UserMinus, UserPlus, Wind } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatMoney, pluralize } from "@/lib/format";
import { FURNISHING_LABEL, roomHighlights } from "@/lib/property";
import type { Furnishing, Room } from "@/lib/types";
import { ActionButton, Avatar, EmptyState, Modal, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

export function RoomsView() {
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [assigning, setAssigning] = useState<Room | null>(null);

  const rooms = data.rooms;
  const residentsOf = (roomId: string) => data.members.filter((member) => member.roomId === roomId);
  const unassigned = data.members.filter((member) => !member.roomId && member.status === "active");
  const totalRent = rooms.reduce((sum, room) => sum + room.rent, 0);
  const freeSpots = rooms.reduce(
    (sum, room) => sum + Math.max(0, room.capacity - residentsOf(room.id).length),
    0,
  );

  const removeRoom = (room: Room) =>
    confirm({
      title: `Delete ${room.name}?`,
      message: `${room.name} and its ${formatMoney(room.rent)} monthly rent will be removed. Expenses already split by room keep their recorded amounts.`,
      confirmLabel: "Delete room",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteRoom", { id: room.id }, `${room.name} deleted.`);
      },
    });

  return (
    <>
      <SectionHeading
        kicker="HOUSE SETUP"
        title="Rooms & rent"
        description="Room rent is shared equally between the people living in it."
        action={
          isManager ? (
            <button className="button button-coral" onClick={() => setAdding(true)}>
              <Plus size={17} aria-hidden="true" /> Add room
            </button>
          ) : undefined
        }
      />

      <div className="rent-summary">
        <div>
          <span>Total monthly rent</span>
          <strong>{formatMoney(totalRent)}</strong>
        </div>
        <div>
          <span>Rooms occupied</span>
          <strong>
            {rooms.filter((room) => residentsOf(room.id).length > 0).length}{" "}
            <small>of {rooms.length}</small>
          </strong>
        </div>
        <div>
          <span>Free spots</span>
          <strong>{freeSpots}</strong>
        </div>
        <div>
          <span>Waiting for a room</span>
          <strong>{unassigned.length}</strong>
        </div>
      </div>

      {unassigned.length > 0 && isManager && (
        <p className="inline-notice">
          {pluralize(unassigned.length, "member has", "members have")} no room yet, so they carry no
          share of rent-split bills.
        </p>
      )}

      {rooms.length === 0 ? (
        <EmptyState
          icon={<Home size={22} aria-hidden="true" />}
          title="No rooms yet"
          message="Add each room with its rent so bills can be split by room."
          action={
            isManager ? (
              <button className="button button-dark" onClick={() => setAdding(true)}>
                <Plus size={16} aria-hidden="true" /> Add your first room
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="rooms-grid">
          {rooms.map((room) => {
            const residents = residentsOf(room.id);
            const full = residents.length >= room.capacity;
            return (
              <article className="room-card" key={room.id}>
                <div className={`room-visual ${room.accent}`}>
                  <Home size={27} aria-hidden="true" />
                  <span className={`status-pill ${full ? "occupied" : "available"}`}>
                    {full ? "Full" : `${room.capacity - residents.length} free`}
                  </span>
                </div>
                <div className="room-card-body">
                  <div className="room-name">
                    <div>
                      <h3>{room.name}</h3>
                      <p>
                        {room.type} &middot; sleeps {room.capacity}
                      </p>
                    </div>
                    {isManager && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-action"
                          disabled={busy}
                          title={`Edit ${room.name}`}
                          aria-label={`Edit ${room.name}`}
                          onClick={() => setEditing(room)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-action danger"
                          disabled={busy || residents.length > 0}
                          title={residents.length ? "Move the residents out first" : `Delete ${room.name}`}
                          aria-label={`Delete ${room.name}`}
                          onClick={() => removeRoom(room)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>

                  <ul className="room-features">
                    {roomHighlights(room).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  {room.notes && <p className="room-notes">{room.notes}</p>}

                  <div className="room-rent">
                    <span>Monthly rent</span>
                    <strong>{formatMoney(room.rent)}</strong>
                  </div>

                  <ul className="resident-list">
                    {residents.map((member) => (
                      <li key={member.id}>
                        <Avatar name={member.name} color={member.color} size="sm" avatarId={member.avatarId} />
                        <span>
                          <strong>
                            {member.id === data.workspace.userId ? "You" : member.name}
                          </strong>
                          <small>{formatMoney(room.rent / residents.length)} of the rent</small>
                        </span>
                        {isManager && (
                          <button
                            type="button"
                            className="icon-action"
                            disabled={busy}
                            title={`Move ${member.name} out of ${room.name}`}
                            aria-label={`Move ${member.name} out of ${room.name}`}
                            onClick={() =>
                              runAction(
                                "assignMember",
                                { memberId: member.id, roomId: null },
                                `${member.name} moved out of ${room.name}.`,
                              )
                            }
                          >
                            <UserMinus size={15} aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                    {residents.length === 0 && <li className="muted-note">Nobody assigned yet</li>}
                  </ul>

                  {isManager && !full && (
                    <button
                      type="button"
                      className="assign-member"
                      onClick={() => setAssigning(room)}
                      disabled={unassigned.length === 0}
                      title={unassigned.length === 0 ? "Everyone already has a room" : undefined}
                    >
                      <UserPlus size={16} aria-hidden="true" />
                      {unassigned.length === 0 ? "Everyone has a room" : "Assign a member"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {adding && <RoomModal count={rooms.length} onClose={() => setAdding(false)} />}
      {editing && <RoomModal room={editing} count={rooms.length} onClose={() => setEditing(null)} />}
      {assigning && (
        <AssignModal room={assigning} candidates={unassigned} onClose={() => setAssigning(null)} />
      )}
    </>
  );
}

function RoomModal({
  room,
  count,
  onClose,
}: {
  room?: Room;
  count: number;
  onClose: () => void;
}) {
  const { runAction, busy } = useWorkspace();
  const [form, setForm] = useState({
    name: room?.name ?? `Room ${String.fromCharCode(65 + count)}`,
    rent: String(room?.rent ?? 6000),
    capacity: String(room?.capacity ?? 2),
    type: room?.type ?? "Shared room",
    attachedBathroom: room?.attachedBathroom ?? false,
    balcony: room?.balcony ?? false,
    airConditioned: room?.airConditioned ?? false,
    furnishing: (room?.furnishing ?? "unfurnished") as Furnishing,
    notes: room?.notes ?? "",
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      room ? "updateRoom" : "addRoom",
      { id: room?.id, ...form, rent: Number(form.rent), capacity: Number(form.capacity) },
      room ? `${form.name} updated.` : `${form.name} added.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={room ? `Edit ${room.name}` : "Add a room"}
      subtitle="Rent, size, and what the room itself has."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Room name
          <input
            autoFocus
            required
            maxLength={60}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Monthly rent (&#2547;)
            <input
              type="number"
              min="0"
              step="1"
              required
              value={form.rent}
              onChange={(event) => setForm({ ...form, rent: event.target.value })}
            />
          </label>
          <label>
            Sleeps
            <select
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {pluralize(value, "person", "people")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <input
            required
            maxLength={80}
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            placeholder="e.g. Master room"
          />
        </label>

        <fieldset className="item-fieldset">
          <legend>What the room has</legend>
          <div className="feature-toggles">
            {(
              [
                ["attachedBathroom", "Attached bathroom", Bath],
                ["balcony", "Balcony", Home],
                ["airConditioned", "Air conditioning", Wind],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                className={form[key] ? "selected" : ""}
                aria-pressed={form[key]}
                onClick={() => setForm({ ...form, [key]: !form[key] })}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          Furnishing
          <select
            value={form.furnishing}
            onChange={(event) => setForm({ ...form, furnishing: event.target.value as Furnishing })}
          >
            {(Object.keys(FURNISHING_LABEL) as Furnishing[]).map((key) => (
              <option key={key} value={key}>
                {FURNISHING_LABEL[key]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Notes (optional)
          <input
            maxLength={300}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="e.g. 12 x 10 ft, south facing"
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit">
            {room ? "Save room" : "Create room"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({
  room,
  candidates,
  onClose,
}: {
  room: Room;
  candidates: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { runAction, busy } = useWorkspace();
  const [memberId, setMemberId] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!memberId) return;
    const name = candidates.find((member) => member.id === memberId)?.name ?? "Member";
    const result = await runAction(
      "assignMember",
      { memberId, roomId: room.id },
      `${name} moved into ${room.name}.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={`Assign to ${room.name}`}
      subtitle={`${formatMoney(room.rent)} rent, shared between everyone in the room.`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Member
          <select required value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Choose a member</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Assigning…" type="submit" disabled={!memberId}>
            Assign member
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
