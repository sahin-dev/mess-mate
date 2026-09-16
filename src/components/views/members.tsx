"use client";

import {
  Check,
  KeyRound,
  LogOut,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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
import { useWorkspace } from "@/components/workspace-context";

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
  const me = data.members.find((member) => member.id === data.workspace.userId);
  const [approving, setApproving] = useState<Member | null>(null);

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

  const leave = () =>
    confirm({
      title: `Leave ${data.workspace.messName}?`,
      message:
        "You lose access to this mess straight away. Your past meals and bazar entries stay in its records, but you will no longer appear in the split. You can ask to join again later.",
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
          : `${member.name} loses access to this mess. Their past meals and bazar entries stay in the records, but they will no longer be part of the split.`,
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
        description={`${pluralize(active.length, "active member")}${invited.length ? ` and ${pluralize(invited.length, "pending invitation")}` : ""}.`}
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
                <Avatar name={member.name} color={member.color} />
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
            <h3>Let people join themselves</h3>
            <p>
              Anyone with this code can join your mess. Regenerate it from Mess settings if it
              spreads too far.
            </p>
          </div>
          <div className="join-code-value">
            <strong>{data.workspace.joinCode}</strong>
            <CopyButton value={data.workspace.joinCode} />
          </div>
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
              <span>Balance</span>
              <span>Joined</span>
              <span className="visually-hidden">Actions</span>
            </div>
            {members.map((member) => {
              const mine = member.id === data.workspace.userId;
              return (
                <div className="member-row" key={member.id}>
                  <div>
                    <Avatar name={member.name} color={member.color} />
                    <span>
                      <strong>
                        {member.name}
                        {mine && <em> (you)</em>}
                      </strong>
                      <small>{member.email}</small>
                    </span>
                  </div>
                  <span className={`role-badge ${member.role.toLowerCase()}`}>{member.role}</span>
                  <span className="cell-muted">{member.room}</span>
                  <span className="cell-muted">
                    {member.status === "invited" ? "—" : member.meals}
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
                      : formatDate(member.joinedAt, { month: "short", year: "numeric" })}
                  </span>
                  <div className="row-actions">
                    {isManager && member.status === "active" && (
                      <button
                        type="button"
                        className="icon-action"
                        disabled={busy || member.id === data.workspace.userId}
                        title={
                          member.id === data.workspace.userId
                            ? "You cannot change your own role"
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
                    {isManager && (
                      <button
                        type="button"
                        className="icon-action danger"
                        disabled={busy || mine}
                        title={mine ? "You cannot remove yourself" : `Remove ${member.name}`}
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

      {me && me.role !== "Manager" && (
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

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {approving && <ApproveModal member={approving} onClose={() => setApproving(null)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { data, runAction, busy } = useWorkspace();
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "inviteMember",
      { email, roomId: roomId || null },
      data.emailEnabled ? "Invitation sent." : "Invitation saved.",
    );
    if (result) onClose();
  };

  return (
    <Modal
      title="Invite a member"
      subtitle="Reserve their place, then share the join code so they can sign up."
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
            onChange={(event) => setEmail(event.target.value)}
            placeholder="housemate@example.com"
          />
        </label>
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
            {data.emailEnabled ? (
              <>
                We will email them an invitation with the join code. Their invitation becomes an
                active membership as soon as they sign up and use it.
              </>
            ) : (
              <>
                Email is not configured on this deployment, so nothing is sent. Share the join code{" "}
                <strong>{data.workspace.joinCode}</strong> with them yourself &mdash; their
                invitation becomes an active membership as soon as they use it.
              </>
            )}
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit">
            Save invitation
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
  const [roomId, setRoomId] = useState("");

  const occupancy = (id: string) => data.members.filter((entry) => entry.roomId === id).length;
  const free = data.rooms.filter((room) => occupancy(room.id) < room.capacity);

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
