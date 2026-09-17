"use client";

import {
  Check,
  ExternalLink,
  Eye,
  Globe,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import {
  FOOD_LABEL,
  GENDER_LABEL,
  listingTitle,
  MARITAL_LABEL,
  MAX_PHOTOS,
  mergePreferences,
  OCCUPATION_LABEL,
  photoUrl,
  SMOKING_LABEL,
} from "@/lib/listing-post";
import { roomHighlights } from "@/lib/property";
import { todayInZone } from "@/lib/timezone";
import type {
  FoodPreference,
  HouseRule,
  Listing,
  MaritalPreference,
  OccupantGender,
  PreferredOccupant,
  Room,
  SmokingRule,
  TenantPreferences,
} from "@/lib/types";
import { ActionButton, EmptyState, Modal, Toggle } from "@/components/ui";
import { ListingPhotos } from "@/components/listing-photos";
import { ListingRules } from "@/components/listing-rules";
import { useWorkspace } from "@/components/workspace-context";

const STATUS_PILL = {
  published: { className: "approved", label: "Public" },
  pending: { className: "pending", label: "Waiting for the manager" },
  draft: { className: "pending", label: "Draft" },
} as const;

export function ListingsTab() {
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
  const [editing, setEditing] = useState<{ listing: Listing | null; room: Room } | null>(null);

  const userId = data.workspace.userId;
  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const occupied = (roomId: string) => data.members.filter((member) => member.roomId === roomId).length;

  // A manager advertises any room with a free space; anyone else may write a
  // post only about the room they actually live in.
  const myRoomId = data.members.find((member) => member.id === userId)?.roomId ?? null;
  const postableRooms = data.rooms.filter((room) => {
    if (occupied(room.id) >= room.capacity && room.id !== myRoomId) return false;
    return isManager || room.id === myRoomId;
  });

  const canEdit = (listing: Listing) => isManager || listing.authorId === userId;
  const mine = data.listings.filter((listing) => canEdit(listing));
  const waiting = isManager ? data.listings.filter((listing) => listing.status === "pending") : [];

  if (!isManager && !myRoomId && data.listings.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone size={22} aria-hidden="true" />}
        title="You are not in a room yet"
        message="Once your manager assigns you a room, you can write a to-let post for it."
      />
    );
  }

  const takeDown = (listing: Listing) =>
    confirm({
      title: `Take ${listing.roomName} off the community?`,
      message:
        "The public page stops working straight away. Search engines may keep a cached copy for a while, which is outside our control.",
      confirmLabel: "Take it down",
      onConfirm: async () => {
        await runAction("unpublishListing", { id: listing.id }, "Post taken down.");
      },
    });

  const remove = (listing: Listing) =>
    confirm({
      title: "Delete this post?",
      message: `The post for ${listing.roomName} is removed completely, photos included. The room itself is not affected.`,
      confirmLabel: "Delete post",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteListing", { id: listing.id }, "Post deleted.");
      },
    });

  return (
    <>
      {waiting.length > 0 && (
        <section className="panel request-panel">
          <div className="settings-heading">
            <span className="settings-icon coral" aria-hidden="true">
              <Send size={21} />
            </span>
            <div>
              <h3>{pluralize(waiting.length, "post")} waiting for you</h3>
              <p>
                A housemate wrote these. Publishing makes the house&rsquo;s real costs public, so
                it is your call.
              </p>
            </div>
          </div>
          <ul className="listing-list">
            {waiting.map((listing) => (
              <li key={listing.id}>
                <div className="listing-main">
                  <div>
                    <strong>{listingTitle(listing, data.workspace.messName)}</strong>
                    <small>
                      {listing.authorName} &middot; {listing.roomName} &middot;{" "}
                      {formatMoney(listing.rentPerSeat)} each
                    </small>
                  </div>
                </div>
                <div className="listing-actions">
                  <button
                    type="button"
                    className="button button-outline button-tiny"
                    onClick={() => {
                      const room = roomById.get(listing.roomId);
                      if (room) setEditing({ listing, room });
                    }}
                  >
                    Read it
                  </button>
                  <ActionButton
                    busy={busy}
                    className="button button-coral button-tiny"
                    onClick={() => runAction("approveListing", { id: listing.id }, "Post published.")}
                  >
                    <Check size={14} aria-hidden="true" /> Publish
                  </ActionButton>
                  <ActionButton
                    busy={busy}
                    className="button button-outline button-tiny"
                    onClick={() =>
                      runAction("rejectListing", { id: listing.id }, "Sent back as a draft.")
                    }
                  >
                    <Undo2 size={14} aria-hidden="true" /> Send back
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon coral" aria-hidden="true">
            <Megaphone size={21} />
          </span>
          <div>
            <h3>To-let posts</h3>
            <p>
              Write about the room the way you would tell a friend &mdash; photos, who it suits,
              and the house rules that actually matter.
            </p>
          </div>
        </div>

        <p className="publish-warning">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            A published post is a public web page that search engines can find. It shows your
            address, the room, what the house has, and{" "}
            <strong>what living here really costs</strong> &mdash; taken from your own records for
            the last completed month. Member names, emails and individual balances are never
            included.
          </span>
        </p>

        {mine.length === 0 ? (
          <EmptyState
            title="No posts yet"
            message={
              postableRooms.length
                ? "Pick a room below and write the first one."
                : "Every room is full. Free up a space first, or add a room."
            }
          />
        ) : (
          <ul className="listing-list">
            {mine.map((listing) => {
              const room = roomById.get(listing.roomId);
              const pill = STATUS_PILL[listing.status];
              return (
                <li key={listing.id}>
                  <div className="listing-main">
                    {listing.photos.length > 0 && (
                      /* eslint-disable-next-line @next/next/no-img-element -- our
                         own route, already downscaled, sized by CSS. */
                      <img
                        className="listing-thumb"
                        src={photoUrl(listing.photos[0].id)}
                        alt=""
                      />
                    )}
                    <div>
                      <strong>{listingTitle(listing, data.workspace.messName)}</strong>
                      <small>
                        {listing.roomName} &middot; {pluralize(listing.seats, "seat")} &middot;{" "}
                        {formatMoney(listing.rentPerSeat)} each &middot; from{" "}
                        {formatDate(listing.availableFrom)}
                        {listing.photos.length > 0 &&
                          ` · ${pluralize(listing.photos.length, "photo")}`}
                      </small>
                    </div>
                    <span className={`status-pill ${pill.className}`}>{pill.label}</span>
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
                        title="Edit post"
                        aria-label={`Edit the post for ${listing.roomName}`}
                        onClick={() => setEditing({ listing, room })}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    )}
                    {listing.status === "published" && isManager && (
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
                      title="Delete post"
                      aria-label={`Delete the post for ${listing.roomName}`}
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

        {postableRooms.length > 0 && (
          <div className="listing-add">
            <span>Write a post about:</span>
            {postableRooms
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
  const { data, runAction, busy, isManager } = useWorkspace();
  const occupied = data.members.filter((member) => member.roomId === room.id).length;
  const free = Math.max(1, room.capacity - occupied);
  const { userVisibility } = data.workspace;
  const publicContact = {
    phone: userVisibility.phone === "public",
    email: userVisibility.email === "public",
  };

  const [form, setForm] = useState({
    title: listing?.title ?? "",
    seats: listing?.seats ?? free,
    rentPerSeat: String(listing?.rentPerSeat ?? Math.round(room.rent / Math.max(1, room.capacity))),
    description: listing?.description ?? "",
    availableFrom: listing?.availableFrom ?? todayInZone(data.settings.timezone),
    contactName: listing?.contactName ?? data.workspace.userName,
    // A new post starts from whichever of your own details you have already
    // said anyone may see. A post keeps its own copy, so changing this later
    // edits the post, not your profile — and a post that has been written
    // before is left exactly as it was written.
    contactPhone: listing?.contactPhone ?? (publicContact.phone ? data.workspace.userPhone : ""),
    contactEmail: listing?.contactEmail ?? (publicContact.email ? data.workspace.userEmail : ""),
  });
  const [preferences, setPreferences] = useState<TenantPreferences>(
    mergePreferences(listing?.preferences, listing?.preferredOccupant),
  );
  const [rules, setRules] = useState<HouseRule[]>(listing?.rules ?? []);
  const [publish, setPublish] = useState(
    listing?.status === "published" || listing?.status === "pending",
  );

  const canPublish = Boolean(form.contactPhone.trim() || form.contactEmail.trim());
  const setPreference = <K extends keyof TenantPreferences>(key: K, value: TenantPreferences[K]) =>
    setPreferences((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const status = publish ? (isManager ? "published" : "pending") : "draft";
    const result = await runAction(
      "saveListing",
      {
        id: listing?.id,
        roomId: room.id,
        status,
        ...form,
        rentPerSeat: Number(form.rentPerSeat) || 0,
        preferences,
        rules,
      },
      status === "published"
        ? `${room.name} is live on the community.`
        : status === "pending"
          ? "Sent to your manager to publish."
          : "Post saved as a draft.",
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={listing ? "Edit your to-let post" : `Write a to-let post for ${room.name}`}
      subtitle={roomHighlights(room).join(" · ")}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <label>
          Headline
          <input
            value={form.title}
            maxLength={120}
            placeholder="e.g. Quiet room for a student, five minutes from the main road"
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>

        <label>
          Your post
          <textarea
            rows={6}
            maxLength={4000}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Who lives here now, what the routine is like, what the area is good for, and anything a new person should know before they move in."
          />
        </label>

        {listing ? (
          <ListingPhotos listingId={listing.id} photos={listing.photos} />
        ) : (
          <p className="field-hint photo-later">
            Save the post once and you can add up to {MAX_PHOTOS} photos to it.
          </p>
        )}

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
          <label>
            Available from
            <input
              type="date"
              required
              value={form.availableFrom}
              onChange={(event) => setForm({ ...form, availableFrom: event.target.value })}
            />
          </label>
        </div>

        <fieldset className="item-fieldset">
          <legend>Who the room would suit</legend>
          <p className="field-hint">
            All optional, and shown as your preference rather than a rule. Leave anything on
            &ldquo;no preference&rdquo; and it is not mentioned on the post at all.
          </p>
          <div className="house-grid">
            <label>
              Occupation
              <select
                value={preferences.occupation}
                onChange={(event) =>
                  setPreference("occupation", event.target.value as PreferredOccupant)
                }
              >
                {(Object.keys(OCCUPATION_LABEL) as PreferredOccupant[]).map((key) => (
                  <option key={key} value={key}>
                    {OCCUPATION_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Looking for
              <select
                value={preferences.gender}
                onChange={(event) => setPreference("gender", event.target.value as OccupantGender)}
              >
                {(Object.keys(GENDER_LABEL) as OccupantGender[]).map((key) => (
                  <option key={key} value={key}>
                    {GENDER_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Smoking
              <select
                value={preferences.smoking}
                onChange={(event) => setPreference("smoking", event.target.value as SmokingRule)}
              >
                {(Object.keys(SMOKING_LABEL) as SmokingRule[]).map((key) => (
                  <option key={key} value={key}>
                    {SMOKING_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Food
              <select
                value={preferences.food}
                onChange={(event) => setPreference("food", event.target.value as FoodPreference)}
              >
                {(Object.keys(FOOD_LABEL) as FoodPreference[]).map((key) => (
                  <option key={key} value={key}>
                    {FOOD_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Household
              <select
                value={preferences.maritalStatus}
                onChange={(event) =>
                  setPreference("maritalStatus", event.target.value as MaritalPreference)
                }
              >
                {(Object.keys(MARITAL_LABEL) as MaritalPreference[]).map((key) => (
                  <option key={key} value={key}>
                    {MARITAL_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Religion
              <input
                value={preferences.religion}
                maxLength={60}
                placeholder="Leave blank for no preference"
                onChange={(event) => setPreference("religion", event.target.value)}
              />
            </label>
          </div>
          <label>
            Anything else about who would suit the room
            <textarea
              rows={2}
              maxLength={400}
              value={preferences.notes}
              onChange={(event) => setPreference("notes", event.target.value)}
              placeholder="e.g. Best for someone on a regular daytime schedule — the other two leave early."
            />
          </label>
        </fieldset>

        <fieldset className="item-fieldset">
          <legend>House rules</legend>
          <ListingRules rules={rules} onChange={setRules} />
        </fieldset>

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
              <Globe size={15} aria-hidden="true" />{" "}
              {isManager ? "Publish to the community" : "Send to your manager"}
            </strong>
            <p>
              {!publish
                ? "Keep it as a draft while you write. Nothing is public until you turn this on."
                : isManager
                  ? "This page will be public and can be found by search engines. It will show your address, the real meal rate and the real monthly bills."
                  : "Your manager sees the post and decides whether it goes public, because publishing makes the house's real costs public."}
            </p>
            {publish && !canPublish && (
              <p className="field-error">Add a phone number or an email first.</p>
            )}
          </div>
          <Toggle
            checked={publish}
            onChange={() => setPublish((value) => !value)}
            label={isManager ? "Publish to the community" : "Send to your manager"}
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
            {publish ? (isManager ? "Publish post" : "Send for approval") : "Save draft"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
