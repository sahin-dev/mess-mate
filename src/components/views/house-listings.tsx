"use client";

import { ExternalLink, Eye, Globe, Megaphone, Pencil, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import { roomHighlights } from "@/lib/property";
import { todayInZone } from "@/lib/timezone";
import type { Listing, PreferredOccupant, Room } from "@/lib/types";
import { ActionButton, EmptyState, Modal, Toggle } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const OCCUPANT_LABEL: Record<PreferredOccupant, string> = {
  anyone: "Anyone",
  students: "Students",
  professionals: "Working professionals",
};

export function ListingsTab() {
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
  const [editing, setEditing] = useState<{ listing: Listing | null; room: Room } | null>(null);

  if (!isManager) {
    return (
      <EmptyState
        icon={<Megaphone size={22} aria-hidden="true" />}
        title="Managers only"
        message="Only a mess manager can advertise a room to the community."
      />
    );
  }

  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const occupied = (roomId: string) => data.members.filter((member) => member.roomId === roomId).length;
  const freeRooms = data.rooms.filter((room) => occupied(room.id) < room.capacity);

  const takeDown = (listing: Listing) =>
    confirm({
      title: `Take ${listing.roomName} off the community?`,
      message:
        "The public page stops working straight away. Search engines may keep a cached copy for a while, which is outside our control.",
      confirmLabel: "Take it down",
      onConfirm: async () => {
        await runAction("unpublishListing", { id: listing.id }, "Listing taken down.");
      },
    });

  const remove = (listing: Listing) =>
    confirm({
      title: `Delete this listing?`,
      message: `The listing for ${listing.roomName} is removed completely. The room itself is not affected.`,
      confirmLabel: "Delete listing",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteListing", { id: listing.id }, "Listing deleted.");
      },
    });

  return (
    <>
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon coral" aria-hidden="true">
            <Megaphone size={21} />
          </span>
          <div>
            <h3>Advertise a room</h3>
            <p>
              A published listing is a public web page that anyone can find, including search
              engines.
            </p>
          </div>
        </div>

        <p className="publish-warning">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            Publishing shows your address, the room, what the house has, and{" "}
            <strong>what living here really costs</strong> &mdash; taken from your own records for
            the last completed month. Member names, emails and individual balances are never
            included.
          </span>
        </p>

        {data.listings.length === 0 ? (
          <EmptyState
            title="No listings yet"
            message={
              freeRooms.length
                ? "Pick a room with a free space to advertise it."
                : "Every room is full. Free up a space first, or add a room."
            }
          />
        ) : (
          <ul className="listing-list">
            {data.listings.map((listing) => {
              const room = roomById.get(listing.roomId);
              return (
                <li key={listing.id}>
                  <div className="listing-main">
                    <div>
                      <strong>{listing.roomName}</strong>
                      <small>
                        {pluralize(listing.seats, "seat")} &middot; {formatMoney(listing.rentPerSeat)} each
                        &middot; from {formatDate(listing.availableFrom)}
                      </small>
                    </div>
                    <span className={`status-pill ${listing.status === "published" ? "approved" : "pending"}`}>
                      {listing.status === "published" ? "Public" : "Draft"}
                    </span>
                  </div>

                  <div className="listing-actions">
                    {listing.status === "published" && (
                      <Link className="text-button" href={`/community/${listing.slug}`} target="_blank">
                        <ExternalLink size={13} aria-hidden="true" /> View public page
                      </Link>
                    )}
                    {room && (
                      <button
                        type="button"
                        className="icon-action"
                        title="Edit listing"
                        aria-label={`Edit the listing for ${listing.roomName}`}
                        onClick={() => setEditing({ listing, room })}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    )}
                    {listing.status === "published" && (
                      <button
                        type="button"
                        className="icon-action"
                        title="Take it off the community"
                        aria-label={`Take ${listing.roomName} off the community`}
                        disabled={busy}
                        onClick={() => takeDown(listing)}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-action danger"
                      title="Delete listing"
                      aria-label={`Delete the listing for ${listing.roomName}`}
                      disabled={busy}
                      onClick={() => remove(listing)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {freeRooms.length > 0 && (
          <div className="listing-add">
            <span>Advertise a room:</span>
            {freeRooms
              .filter((room) => !data.listings.some((listing) => listing.roomId === room.id))
              .map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className="button button-outline button-tiny"
                  onClick={() => setEditing({ listing: null, room })}
                >
                  {room.name}
                </button>
              ))}
          </div>
        )}
      </section>

      {editing && (
        <ListingModal
          listing={editing.listing}
          room={editing.room}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function ListingModal({
  listing,
  room,
  onClose,
}: {
  listing: Listing | null;
  room: Room;
  onClose: () => void;
}) {
  const { data, runAction, busy } = useWorkspace();
  const occupied = data.members.filter((member) => member.roomId === room.id).length;
  const free = Math.max(1, room.capacity - occupied);

  const [form, setForm] = useState({
    seats: listing?.seats ?? free,
    rentPerSeat: String(listing?.rentPerSeat ?? Math.round(room.rent / Math.max(1, room.capacity))),
    description: listing?.description ?? "",
    availableFrom: listing?.availableFrom ?? todayInZone(data.settings.timezone),
    preferredOccupant: listing?.preferredOccupant ?? ("anyone" as PreferredOccupant),
    contactName: listing?.contactName ?? data.workspace.userName,
    contactPhone: listing?.contactPhone ?? "",
    contactEmail: listing?.contactEmail ?? "",
  });
  const [publish, setPublish] = useState(listing?.status === "published");

  const canPublish = Boolean(form.contactPhone.trim() || form.contactEmail.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "saveListing",
      {
        id: listing?.id,
        roomId: room.id,
        status: publish ? "published" : "draft",
        ...form,
        rentPerSeat: Number(form.rentPerSeat) || 0,
      },
      publish ? `${room.name} is live on the community.` : "Listing saved as a draft.",
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={listing ? `Edit the listing for ${room.name}` : `Advertise ${room.name}`}
      subtitle={roomHighlights(room).join(" · ")}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Letting to
            <select
              value={form.seats}
              onChange={(event) => setForm({ ...form, seats: Number(event.target.value) })}
            >
              {Array.from({ length: room.capacity }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {pluralize(count, "person", "people")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rent per person (&#2547;)
            <input
              type="number"
              min="0"
              required
              inputMode="numeric"
              value={form.rentPerSeat}
              onChange={(event) => setForm({ ...form, rentPerSeat: event.target.value })}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Available from
            <input
              type="date"
              required
              value={form.availableFrom}
              onChange={(event) => setForm({ ...form, availableFrom: event.target.value })}
            />
          </label>
          <label>
            Suited to
            <select
              value={form.preferredOccupant}
              onChange={(event) =>
                setForm({ ...form, preferredOccupant: event.target.value as PreferredOccupant })
              }
            >
              {(Object.keys(OCCUPANT_LABEL) as PreferredOccupant[]).map((key) => (
                <option key={key} value={key}>
                  {OCCUPANT_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          About the room and the house
          <textarea
            rows={4}
            maxLength={2000}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Who lives here now, what the routine is like, anything a new person should know."
          />
        </label>

        <fieldset className="item-fieldset">
          <legend>How people reach you</legend>
          <p className="field-hint">
            Whatever you put here appears on the public page. Use a number you are happy to share.
          </p>
          <div className="house-grid">
            <label>
              Name
              <input
                value={form.contactName}
                maxLength={80}
                onChange={(event) => setForm({ ...form, contactName: event.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={form.contactPhone}
                maxLength={40}
                onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
                placeholder="01XXXXXXXXX"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.contactEmail}
                maxLength={180}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
            </label>
          </div>
        </fieldset>

        <div className={`publish-row ${publish ? "on" : ""}`}>
          <div>
            <strong>
              <Globe size={15} aria-hidden="true" /> Publish to the community
            </strong>
            <p>
              {publish
                ? "This page will be public and can be found by search engines. It will show your address, the real meal rate and the real monthly bills."
                : "Keep it as a draft while you decide. Nothing is public until you turn this on."}
            </p>
            {publish && !canPublish && (
              <p className="field-error">Add a phone number or an email first.</p>
            )}
          </div>
          <Toggle
            checked={publish}
            onChange={() => setPublish((value) => !value)}
            label="Publish to the community"
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton
            busy={busy}
            busyLabel="Saving…"
            type="submit"
            disabled={publish && !canPublish}
            className={`button ${publish ? "button-coral" : "button-dark"}`}
          >
            {publish ? "Publish listing" : "Save draft"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
