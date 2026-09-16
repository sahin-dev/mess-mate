"use client";

import { Check, Plus, Refrigerator, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FACILITY_CATALOGUE } from "@/lib/property";
import type { Facility } from "@/lib/types";
import { ActionButton, EmptyState } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

export function FacilitiesTab() {
  const { data } = useWorkspace();
  const snapshot = JSON.stringify(data.facilities);
  return <FacilitiesForm key={snapshot} snapshot={snapshot} />;
}

function FacilitiesForm({ snapshot }: { snapshot: string }) {
  const { data, runAction, busy, isManager } = useWorkspace();
  const [facilities, setFacilities] = useState<Facility[]>(() => structuredClone(data.facilities));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const dirty = JSON.stringify(facilities) !== snapshot;
  const hints = new Map(FACILITY_CATALOGUE.map((item) => [item.id, item.hint]));
  const isCustom = (id: string) => !FACILITY_CATALOGUE.some((item) => item.id === id);
  const available = facilities.filter((facility) => facility.available).length;

  const update = (index: number, changes: Partial<Facility>) =>
    setFacilities(facilities.map((facility, position) => (position === index ? { ...facility, ...changes } : facility)));

  const save = async () => {
    const result = await runAction("saveFacilities", { facilities }, "Facilities saved.");
    if (result) setSaved(true);
  };

  if (!isManager) {
    const shown = facilities.filter((facility) => facility.available);
    return (
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon" aria-hidden="true">
            <Refrigerator size={21} />
          </span>
          <div>
            <h3>What the house has</h3>
            <p>Shared equipment and services, as recorded by your manager.</p>
          </div>
        </div>
        {shown.length === 0 ? (
          <EmptyState title="Nothing listed yet" message="Your manager has not filled this in." />
        ) : (
          <ul className="facility-chips">
            {shown.map((facility) => (
              <li key={facility.id}>
                <Check size={13} aria-hidden="true" />
                <span>
                  <strong>{facility.label}</strong>
                  {facility.detail && <small>{facility.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon" aria-hidden="true">
            <Refrigerator size={21} />
          </span>
          <div>
            <h3>What the house has</h3>
            <p>
              Tick what is there and add a detail where it matters. {available} of {facilities.length}{" "}
              ticked.
            </p>
          </div>
        </div>

        <ul className="facility-list">
          {facilities.map((facility, index) => (
            <li key={facility.id} className={facility.available ? "on" : ""}>
              <button
                type="button"
                className="facility-toggle"
                aria-pressed={facility.available}
                onClick={() => update(index, { available: !facility.available })}
              >
                <span aria-hidden="true">{facility.available && <Check size={13} />}</span>
                {isCustom(facility.id) ? (
                  <input
                    value={facility.label}
                    maxLength={80}
                    aria-label="Facility name"
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                ) : (
                  <strong>{facility.label}</strong>
                )}
              </button>

              <input
                className="facility-detail"
                value={facility.detail}
                maxLength={200}
                disabled={!facility.available}
                aria-label={`Detail for ${facility.label}`}
                placeholder={hints.get(facility.id) ?? "Optional detail"}
                onChange={(event) => update(index, { detail: event.target.value })}
              />

              {isCustom(facility.id) && (
                <button
                  type="button"
                  className="icon-action danger"
                  aria-label={`Remove ${facility.label}`}
                  onClick={() => setFacilities(facilities.filter((_, position) => position !== index))}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="add-inline"
          onClick={() =>
            setFacilities([
              ...facilities,
              { id: `custom_${Date.now()}`, label: "Something else", available: true, detail: "" },
            ])
          }
        >
          <Plus size={16} aria-hidden="true" /> Add something not on the list
        </button>
      </section>

      <div className={`settings-save ${dirty ? "dirty" : ""}`}>
        <span>{saved ? "Facilities saved" : dirty ? "You have unsaved changes" : "Everything is saved"}</span>
        <ActionButton
          busy={busy}
          busyLabel="Saving…"
          className={`button ${saved ? "button-success" : "button-dark"}`}
          onClick={save}
          disabled={!dirty}
        >
          Save changes
        </ActionButton>
      </div>
    </>
  );
}
