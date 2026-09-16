"use client";

import { KeyRound, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
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
  const { data, runAction, busy, isManager, confirm } = useWorkspace();
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

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
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
