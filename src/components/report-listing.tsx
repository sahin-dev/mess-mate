"use client";

import { Flag } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ListingReportReason } from "@/lib/types";
import { ActionButton, Modal } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";

const REASONS: { value: ListingReportReason; label: string }[] = [
  { value: "scam", label: "It looks like a scam (e.g. asks for money before a visit)" },
  { value: "unavailable", label: "The room is no longer available" },
  { value: "misleading", label: "The details or photos are misleading" },
  { value: "discriminatory", label: "It discriminates against people" },
  { value: "offensive", label: "It contains offensive content" },
  { value: "other", label: "Something else" },
];

/** Lets a visitor flag a public post for the MessMate team. No sign-in needed. */
export function ReportListing({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReason | "">("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ message: string }>("/api/report", { slug, reason, details, contact });
      setSent(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="text-button report-link" onClick={() => setOpen(true)}>
        <Flag size={13} aria-hidden="true" /> Report this post
      </button>
      {open && (
        <Modal
          title={sent ? "Report sent" : "Report this post"}
          subtitle={sent ? undefined : "The MessMate team reviews every report. The poster is not told who sent it."}
          onClose={() => setOpen(false)}
        >
          {sent ? (
            <>
              <p className="report-sent">{sent}</p>
              <div className="modal-actions">
                <button type="button" className="button button-dark" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit}>
              <fieldset className="report-reasons">
                <legend>What is wrong?</legend>
                {REASONS.map((option) => (
                  <label key={option.value} className="radio-row">
                    <input
                      type="radio"
                      name="reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                      required
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
              <label>
                Anything else we should know?{reason === "other" ? "" : " (optional)"}
                <textarea
                  rows={3}
                  maxLength={1000}
                  required={reason === "other"}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                />
              </label>
              <label>
                Your email (optional, if you are happy for us to follow up)
                <input type="email" maxLength={180} value={contact} onChange={(event) => setContact(event.target.value)} />
              </label>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="button button-outline" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <ActionButton busy={busy} busyLabel="Sending…" type="submit" disabled={!reason}>
                  Send report
                </ActionButton>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
