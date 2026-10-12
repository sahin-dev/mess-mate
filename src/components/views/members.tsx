"use client";

import {
  CalendarDays,
  Check,
  KeyRound,
  LogOut,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { formatDate, formatMoney, pluralize, signedMoney } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Member } from "@/lib/types";
import {
  ActionButton,
  Avatar,
  CopyButton,
  EmptyState,
  Modal,
  SectionHeading,
} from "@/components/ui";
import { requestJson, useWorkspace } from "@/components/workspace-context";

export function MembersView() {
  const router = useRouter();
  const { data, runAction, busy, isManager, confirm, notify } = useWorkspace();
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const search = query.trim().toLowerCase();
  const members = data.members.filter(
    (member) =>
      (roleFilter === "All" || member.role === roleFilter) &&
      (!search || `${member.name} ${member.email}`.toLowerCase().includes(search)),
  );
  const active = data.members.filter((member) => member.status === "active");
  const invited = data.members.filter((member) => member.status === "invited");
  const requests = data.members.filter((member) => member.status === "requested");
  const former = data.members.filter((member) => member.status === "former");
  const me = data.members.find((member) => member.id === data.workspace.userId);
  const [approving, setApproving] = useState<Member | null>(null);
  const [editingMealDate, setEditingMealDate] = useState<Member | null>(null);

  const reject = (member: Member) =>
    confirm({
      title: `Decline ${member.name}?`,
      message:
        "Their request to join is removed. They can ask again with the join code, so regenerate it in Mess settings if you want to stop that.",
      confirmLabel: "Decline",
      tone: "danger",
      onConfirm: async () => {
        await runAction("rejectMember", { id: member.id }, `${member.name} declined.`);
      },
    });

  const resendInvite = async (member: Member) => {
    const result = await runAction("resendInvitation", { id: member.id });
    if (!result) return;
    const status = result.members.find((entry) => entry.id === member.id)?.invitationDelivery;
    notify(status === "sent" ? `Invitation email accepted for ${member.email}.` : "Email could not be sent. Share the code directly or retry later.", status === "sent" ? "success" : "error");
  };

  const leave = () =>
    confirm({
      title: `Leave ${data.workspace.messName}?`,
      message:
        "You lose access straight away. Your membership end date, past meals, payments, and settlement history remain intact. You can ask to join again later.",
      confirmLabel: "Leave this mess",
      tone: "danger",
      onConfirm: async () => {
        const response = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leaveMess" }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          notify(payload.error ?? "You could not be removed.", "error");
          return;
        }
        // The session no longer has a workspace, so re-run the server layouts.
        router.replace("/join");
        router.refresh();
      },
    });

  const removeMember = (member: Member) =>
    confirm({
      title: `Remove ${member.name}?`,
      message:
        member.status === "invited"
          ? `The invitation for ${member.email} will be cancelled.`
          : `${member.name} loses access now. Their membership end date and all historical balances remain in the ledger.`,
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: async () => {
        await runAction("deleteMember", { id: member.id }, `${member.name} removed.`);
      },
    });

  const changeRole = (member: Member) => {
    const next = member.role === "Manager" ? "Member" : "Manager";
    confirm({
      title: next === "Manager" ? `Make ${member.name} a manager?` : `Remove manager access?`,
      message:
        next === "Manager"
          ? `${member.name} will be able to approve bazar, record bills, manage rooms and change mess settings.`
          : `${member.name} will keep their membership but lose the ability to approve or change mess settings.`,
      confirmLabel: next === "Manager" ? "Make manager" : "Remove access",
      onConfirm: async () => {
        await runAction("setMemberRole", { id: member.id, role: next }, `${member.name} is now a ${next.toLowerCase()}.`);
      },
    });
  };

  return (
    <>
      <SectionHeading
        kicker={data.workspace.messName.toUpperCase()}
        title="Mess members"
        description={`${pluralize(active.length, "active member")}${invited.length ? `, ${pluralize(invited.length, "pending invitation")}` : ""}${former.length ? `, and ${pluralize(former.length, "former member")}` : ""}.`}
        action={
          isManager ? (
            <button className="button button-coral" onClick={() => setInviting(true)}>
              <UserPlus size={17} aria-hidden="true" /> Invite member
            </button>
          ) : undefined
        }
      />

      {isManager && requests.length > 0 && (
        <section className="panel request-panel">
          <div className="table-toolbar">
            <div>
              <h3>{pluralize(requests.length, "person wants", "people want")} to join</h3>
              <p>Accepting someone adds them to the split, and you can give them a room here.</p>
            </div>
          </div>
          <ul className="request-list">
            {requests.map((member) => (
              <li key={member.id}>
                <Avatar name={member.name} color={member.color} avatarId={member.avatarId} />
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
                <span className="cell-muted">asked {formatDate(member.joinedAt)}</span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button-dark button-tiny"
                    disabled={busy}
                    onClick={() => setApproving(member)}
                  >
                    <Check size={14} aria-hidden="true" /> Accept
                  </button>
                  <button
                    type="button"
                    className="button button-outline button-tiny"
                    disabled={busy}
                    onClick={() => reject(member)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isManager && (
        <section className="join-code-banner">
          <span className="join-code-icon" aria-hidden="true">
            <KeyRound size={22} />
          </span>
          <div>
            <span>MESS JOIN CODE</span>
            <h3>Let people request access</h3>
            <p>Anyone with this code can request to join. Only a manager can approve access. Regenerate it from Mess settings if it spreads too far.</p>
          </div>
          <div className="join-code-value">
            <strong>{data.workspace.joinCode}</strong>
            <CopyButton value={data.workspace.joinCode} />
          </div>
        </section>
      )}

      {isManager && invited.length > 0 && (
        <section className="panel request-panel">
          <div className="table-toolbar">
            <div><h3>{pluralize(invited.length, "invitation")} awaiting a request</h3><p>Invited people still need to use the code and receive manager approval.</p></div>
          </div>
          <ul className="request-list">
            {invited.map((member) => <li key={member.id}>
              <Avatar name={member.name} color={member.color} avatarId={member.avatarId} />
              <div><strong>{member.name}</strong><small>{member.email}</small></div>
              <span className="cell-muted">{member.invitationDelivery === "sent" ? "Email accepted" : member.invitationDelivery === "failed" ? "Email failed" : "Share code directly"}</span>
              <div className="row-actions">
                <button type="button" className="button button-outline button-tiny" disabled={busy} onClick={() => resendInvite(member)}>Retry email</button>
              </div>
            </li>)}
          </ul>
        </section>
      )}

      <section className="panel members-card">
        <div className="table-toolbar">
          <div>
            <h3>Balances for {periodLabel(data.period)}</h3>
            <p>What each person paid, against what they used</p>
          </div>
          <div className="view-actions">
            <label className="search-box">
              <Search size={15} aria-hidden="true" />
              <span className="visually-hidden">Search members</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members"
              />
            </label>
            <label className="filter-button">
              <span className="visually-hidden">Filter by role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option>All</option>
                <option>Manager</option>
                <option>Member</option>
                <option>Invited</option>
              </select>
            </label>
          </div>
        </div>

        {members.length === 0 ? (
          <EmptyState
            icon={<Users size={22} aria-hidden="true" />}
            title="Nobody matches"
            message="Try a different search, or clear the role filter."
          />
        ) : (
          <div className="members-table">
            <div className="members-head">
              <span>Member</span>
              <span>Role</span>
              <span>Room</span>
              <span>Meals</span>
              <span>Meals from</span>
              <span>Balance</span>
              <span>Joined</span>
              <span className="visually-hidden">Actions</span>
            </div>
            {members.map((member) => {
              const mine = member.id === data.workspace.userId;
              // The owner cannot be demoted or removed; the server refuses it too.
              const owner = member.id === data.workspace.ownerId;
              return (
                <div className="member-row" key={member.id}>
                  <div>
                    <Avatar name={member.name} color={member.color} avatarId={member.avatarId} />
                    <span>
                      <strong>
                        {member.name}
                        {mine && <em> (you)</em>}
                      </strong>
                      {member.email ? (
                        <small>{member.email}</small>
                      ) : (
                        <small className="cell-muted">Contact details hidden</small>
                      )}
                      {member.phone && <small className="member-phone">{member.phone}</small>}
                    </span>
                  </div>
                  <span className={`role-badge ${member.status === "former" ? "former" : member.role.toLowerCase()}`}>
                    {member.status === "former" ? "Former" : owner ? "Owner" : member.role}
                  </span>
                  <span className="cell-muted">{member.room}</span>
                  <span className="cell-muted">
                    {member.status === "invited" ? "—" : member.meals}
                  </span>
                  <span className="cell-muted">
                    {member.status === "active"
                      ? formatDate(member.mealCountFrom, { month: "short", year: "numeric" })
                      : "—"}
                  </span>
                  <strong
                    className={
                      member.status === "invited"
                        ? "cell-muted"
                        : member.balance > 0
                          ? "positive-text"
                          : member.balance < 0
                            ? "negative-text"
                            : ""
                    }
                    title={
                      member.status === "invited"
                        ? undefined
                        : `Paid ${formatMoney(member.paid)} − meals ${formatMoney(member.mealCost)} − bills ${formatMoney(member.expenseShare)}`
                    }
                  >
                    {member.status === "invited" ? "—" : signedMoney(member.balance)}
                  </strong>
                  <span className="cell-muted">
                    {member.status === "invited"
                      ? "Invited"
                      : member.status === "former" && member.leftAt
                        ? `Left ${formatDate(member.leftAt, { month: "short", year: "numeric" })}`
                      : formatDate(member.joinedAt, { month: "short", year: "numeric" })}
                  </span>
                  <div className="row-actions">
                    {isManager && member.status === "active" && (
                      <button
                        type="button"
                        className="icon-action"
                        disabled={busy}
                        title={`Set when ${mine ? "your" : `${member.name}'s`} meals start counting`}
                        aria-label={`Set meal counting date for ${member.name}`}
                        onClick={() => setEditingMealDate(member)}
                      >
                        <CalendarDays size={16} aria-hidden="true" />
                      </button>
                    )}
                    {isManager && member.status === "active" && (
                      <button
                        type="button"
                        className="icon-action"
                        disabled={busy || mine || owner}
                        title={
                          mine
                            ? "You cannot change your own role"
                            : owner
                              ? "The owner always stays a manager"
                            : member.role === "Manager"
                              ? "Remove manager access"
                              : "Make manager"
                        }
                        aria-label={
                          member.role === "Manager"
                            ? `Remove manager access from ${member.name}`
                            : `Make ${member.name} a manager`
                        }
                        onClick={() => changeRole(member)}
                      >
                        <ShieldCheck size={16} aria-hidden="true" />
                      </button>
                    )}
                    {isManager && member.status !== "former" && (
                      <button
                        type="button"
                        className="icon-action danger"
                        disabled={busy || mine || owner}
                        title={
                          mine
                            ? "You cannot remove yourself"
                            : owner
                              ? "The owner cannot be removed"
                              : `Remove ${member.name}`
                        }
                        aria-label={`Remove ${member.name}`}
                        onClick={() => removeMember(member)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {me && !data.workspace.isOwner && (
        <section className="leave-mess">
          <div>
            <strong>Leaving {data.workspace.messName}?</strong>
            <p>
              You can leave at any time. Settle anything you owe first &mdash; leaving does not
              clear your balance.
            </p>
          </div>
          <button type="button" className="button button-outline" onClick={leave}>
            <LogOut size={15} aria-hidden="true" /> Leave this mess
          </button>
        </section>
      )}
      {me && data.workspace.isOwner && (
        <section className="leave-mess">
          <div>
            <strong>Moving out?</strong>
            <p>
              You own {data.workspace.messName}, so hand ownership to a housemate in Mess settings
              before you leave.
            </p>
          </div>
          <Link className="button button-outline" href="/settings">
            Hand over ownership
          </Link>
        </section>
      )}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {approving && <ApproveModal member={approving} onClose={() => setApproving(null)} />}
      {editingMealDate && (
        <MealCountDateModal member={editingMealDate} onClose={() => setEditingMealDate(null)} />
      )}
    </>
  );
}

function MealCountDateModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { runAction, busy } = useWorkspace();
  const [mealCountFrom, setMealCountFrom] = useState(member.mealCountFrom);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "setMealCountFrom",
      { id: member.id, mealCountFrom },
      `${member.name}'s meal counting date updated.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={`Count ${member.name}'s meals from`}
      subtitle="Choose the first date included in meal totals, the meal rate, and open settlements."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          First counted date
          <input
            autoFocus
            type="date"
            required
            value={mealCountFrom}
            onChange={(event) => setMealCountFrom(event.target.value)}
          />
          <small className="field-hint">
            Earlier saved meals remain visible. Closed-month settlements stay frozen.
          </small>
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit">
            Save date
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { data, runAction, busy, notify } = useWorkspace();
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");
  const [lookup, setLookup] = useState<{
    email: string;
    found: boolean;
    name: string | null;
    available: boolean;
    reason: string | null;
  } | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookupSeq = useRef(0);

  const searchAccount = async () => {
    const current = ++lookupSeq.current;
    setLooking(true);
    setLookupError("");
    try {
      const result = await requestJson<NonNullable<typeof lookup>>(
        `/api/members/lookup?email=${encodeURIComponent(email.trim())}`,
      );
      if (current === lookupSeq.current) setLookup(result);
    } catch (error) {
      if (current === lookupSeq.current) {
        setLookup(null);
        setLookupError(error instanceof Error ? error.message : "Account search failed. Try again.");
      }
    } finally {
      if (current === lookupSeq.current) setLooking(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lookup || lookup.email !== email.trim().toLowerCase() || !lookup.available) {
      await searchAccount();
      return;
    }
    const result = await runAction(
      "inviteMember",
      { email, roomId: roomId || null },
    );
    if (result) {
      const delivery = result.members.find((member) => member.email === lookup.email)?.invitationDelivery;
      notify(
        delivery === "sent"
          ? "Invitation email accepted. They can now request to join; you will approve the request."
          : "Invitation saved, but email was not sent. Share the join code directly or retry from Members.",
        delivery === "sent" ? "success" : "error",
      );
      onClose();
    }
  };

  return (
    <Modal
      title="Invite a member"
      subtitle="Find an account by exact email, or invite an address for someone who will sign up."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Email address
          <input
            autoFocus
            type="email"
            required
            value={email}
            onChange={(event) => {
              lookupSeq.current += 1;
              setEmail(event.target.value);
              setLookup(null);
              setLookupError("");
              setLooking(false);
            }}
            placeholder="housemate@example.com"
          />
        </label>
        <div className="invite-search-row">
          <button type="button" className="button button-outline" disabled={looking || busy || !email.trim()} onClick={searchAccount}>
            <Search size={15} aria-hidden="true" /> {looking ? "Searching..." : "Find account"}
          </button>
          {lookup && <span role="status" className={lookup.available ? "invite-lookup-ok" : "invite-lookup-unavailable"}>
            {lookup.reason ?? (lookup.found ? `Found ${lookup.name}. Ready to invite.` : "No account yet. This email can still be invited.")}
          </span>}
        </div>
        {lookupError && <p className="field-error" role="alert">{lookupError}</p>}
        <label>
          Room (optional)
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">Assign later</option>
            {data.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <div className="invite-note">
          <KeyRound size={17} aria-hidden="true" />
          <p>
            {data.emailEnabled
              ? "We will try to email the join link and show its send status. Using the code creates a request that you must approve."
              : <>Email is not configured. Share code <strong>{data.workspace.joinCode}</strong> directly. The person still needs your approval.</>}
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Inviting…" type="submit" disabled={!lookup?.available || lookup.email !== email.trim().toLowerCase()}>
            Invite email
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Accepting a request and giving the person a room are the same decision in
 * practice, so they happen in one dialog.
 */
function ApproveModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { data, runAction, busy } = useWorkspace();
  const occupancy = (id: string) => data.members.filter((entry) => entry.status === "active" && entry.roomId === id).length;
  const free = data.rooms.filter((room) => occupancy(room.id) < room.capacity);
  const [roomId, setRoomId] = useState(
    member.roomId && free.some((room) => room.id === member.roomId) ? member.roomId : "",
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "approveMember",
      { id: member.id, roomId: roomId || null },
      `${member.name} is in.`,
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={`Accept ${member.name}?`}
      subtitle="They join the split from today and can record their own meals straight away."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="invite-note">
          <UserPlus size={17} aria-hidden="true" />
          <p>
            {member.email} will be able to see this mess: its meals, bazar, bills and
            everyone&rsquo;s balances. They cannot change the rules or approve anything.
          </p>
        </div>

        <label>
          Give them a room (optional)
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">Assign later</option>
            {free.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} &middot; {room.capacity - occupancy(room.id)} free
              </option>
            ))}
          </select>
          {data.rooms.length === 0 ? (
            <small className="field-hint">Add rooms under House to assign one.</small>
          ) : free.length === 0 ? (
            <small className="field-hint">Every room is full, so they start unassigned.</small>
          ) : null}
        </label>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Accepting\u2026" type="submit">
            Accept and add
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
