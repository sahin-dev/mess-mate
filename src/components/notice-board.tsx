"use client";

import { Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { relativeTime } from "@/lib/format";
import type { Notice } from "@/lib/types";
import { ActionButton, Modal, Toggle } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

/**
 * The house notice board: "Gas off on Sunday", "Rent due by the 5th".
 *
 * Managers post; everyone reads. Pinned notices stay on top. A member with
 * nothing to read sees nothing at all, rather than an empty box.
 */
export function NoticeBoard() {
  const { data, isManager, confirm, runAction, busy } = useWorkspace();
  const [editing, setEditing] = useState<Notice | "new" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const notices = data.notices;
  const canEdit = isManager && !data.workspace.suspended;

  if (!notices.length && !canEdit) return null;
  const shown = expanded ? notices : notices.slice(0, 3);

  return (
    <section className="panel notice-board" aria-labelledby="notice-board-title">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">NOTICE BOARD</span>
          <h3 id="notice-board-title">For everyone in the house</h3>
        </div>
        {canEdit && (
          <button type="button" className="button button-outline button-tiny" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" /> Post a notice
          </button>
        )}
      </div>

      {notices.length === 0 ? (
        <p className="notice-empty">
          Nothing pinned up yet. Post rent dates, cleaning rotas, or a heads-up about the gas or
          water — everyone sees it here.
        </p>
      ) : (
        <ul className="notice-list">
          {shown.map((notice) => (
            <li key={notice.id} className={notice.pinned ? "pinned" : ""}>
              <div>
                <strong>
                  {notice.pinned && <Pin size={13} aria-label="Pinned" />}
                  {notice.title}
                </strong>
                {notice.body && <p>{notice.body}</p>}
                <small>
                  {notice.authorName} ·{" "}
                  <time dateTime={notice.createdAt} suppressHydrationWarning>
                    {relativeTime(notice.createdAt)}
                  </time>
                </small>
              </div>
              {canEdit && (
                <span className="row-actions">
                  <button
                    type="button"
                    className="icon-action"
                    aria-label={`Edit ${notice.title}`}
                    title="Edit"
                    disabled={busy}
                    onClick={() => setEditing(notice)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-action danger"
                    aria-label={`Remove ${notice.title}`}
                    title="Remove"
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: "Take this notice down?",
                        message: `“${notice.title}” disappears from everyone's dashboard.`,
                        confirmLabel: "Remove notice",
                        tone: "danger",
                        onConfirm: async () => {
                          await runAction("deleteNotice", { id: notice.id }, "Notice removed.");
                        },
                      })
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {notices.length > 3 && (
        <button type="button" className="text-button notice-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show all ${notices.length}`}
        </button>
      )}

      {editing && (
        <NoticeForm notice={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function NoticeForm({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const { runAction, busy } = useWorkspace();
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [pinned, setPinned] = useState(notice?.pinned ?? false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "saveNotice",
      { id: notice?.id, title, body, pinned },
      notice ? "Notice updated." : "Notice posted for everyone.",
    );
    if (result) onClose();
  };

  return (
    <Modal
      title={notice ? "Edit notice" : "Post a notice"}
      subtitle="Everyone in the mess sees it on their dashboard."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Headline
          <input
            autoFocus
            required
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Rent is due by the 5th"
          />
        </label>
        <label>
          Details (optional)
          <textarea
            rows={4}
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Anything people need to know or do."
          />
        </label>
        <div className="setting-row compact">
          <div>
            <strong>Pin to the top</strong>
            <p>Pinned notices stay above newer ones until you unpin them.</p>
          </div>
          <Toggle checked={pinned} onChange={() => setPinned(!pinned)} label="Pin this notice" />
        </div>
        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <ActionButton busy={busy} busyLabel="Saving…" type="submit" disabled={!title.trim()}>
            {notice ? "Save changes" : "Post notice"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
