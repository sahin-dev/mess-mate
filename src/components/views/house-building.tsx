"use client";

import { Building2, Car, MapPin, MoveVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { FLOOR_OPTIONS, PARKING_LABEL } from "@/lib/property";
import type { MessProperty, ParkingType } from "@/lib/types";
import { MapPicker, type GeocodeResult } from "@/components/map-picker";
import { ActionButton, Toggle } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

export function BuildingTab() {
  const { data } = useWorkspace();
  // Keyed on the saved value, so the form restarts when the server changes.
  const snapshot = JSON.stringify(data.property);
  return <BuildingForm key={snapshot} snapshot={snapshot} />;
}

function BuildingForm({ snapshot }: { snapshot: string }) {
  const { data, runAction, busy, isManager } = useWorkspace();
  const [property, setProperty] = useState<MessProperty>(() => structuredClone(data.property));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const dirty = JSON.stringify(property) !== snapshot;
  const patch = (changes: Partial<MessProperty>) => setProperty({ ...property, ...changes });
  const patchParking = (changes: Partial<MessProperty["parking"]>) =>
    setProperty({ ...property, parking: { ...property.parking, ...changes } });

  const save = async () => {
    const result = await runAction("saveProperty", { property }, "House details saved.");
    if (result) setSaved(true);
  };

  // A search result fills in whatever the address fields are still missing.
  const adoptPlace = (result: GeocodeResult) =>
    setProperty((current) => ({
      ...current,
      area: current.area || result.area,
      city: current.city || result.city,
      postcode: current.postcode || result.postcode,
      addressLine: current.addressLine || result.label.split(",")[0],
      coordinates: { lat: result.lat, lng: result.lng },
    }));

  const readOnly = !isManager;

  return (
    <>
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon" aria-hidden="true">
            <Building2 size={21} />
          </span>
          <div>
            <h3>Address</h3>
            <p>Where the flat is. This is what appears on a community listing.</p>
          </div>
        </div>

        <div className="house-grid">
          <label>
            Street or holding
            <input
              value={property.addressLine}
              disabled={readOnly}
              maxLength={160}
              onChange={(event) => patch({ addressLine: event.target.value })}
              placeholder="e.g. 14/B Green Road"
            />
          </label>
          <label>
            Area
            <input
              value={property.area}
              disabled={readOnly}
              maxLength={120}
              onChange={(event) => patch({ area: event.target.value })}
              placeholder="e.g. Dhanmondi"
            />
          </label>
          <label>
            City
            <input
              value={property.city}
              disabled={readOnly}
              maxLength={120}
              onChange={(event) => patch({ city: event.target.value })}
              placeholder="e.g. Dhaka"
            />
          </label>
          <label>
            Postcode
            <input
              value={property.postcode}
              disabled={readOnly}
              maxLength={20}
              onChange={(event) => patch({ postcode: event.target.value })}
              placeholder="e.g. 1205"
            />
          </label>
        </div>
      </section>

      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon blue" aria-hidden="true">
            <MoveVertical size={21} />
          </span>
          <div>
            <h3>The flat and the building</h3>
            <p>The things people ask before they agree to come and see it.</p>
          </div>
        </div>

        <div className="house-grid">
          <label>
            Floor
            <select
              value={property.floor}
              disabled={readOnly}
              onChange={(event) => patch({ floor: event.target.value })}
            >
              <option value="">Not set</option>
              {FLOOR_OPTIONS.map((floor) => (
                <option key={floor} value={floor}>
                  {floor}
                </option>
              ))}
            </select>
          </label>
          <label>
            Flat number
            <input
              value={property.flatNumber}
              disabled={readOnly}
              maxLength={24}
              onChange={(event) => patch({ flatNumber: event.target.value })}
              placeholder="e.g. 4A"
            />
          </label>
        </div>

        <div className="setting-row">
          <div>
            <strong>Lift in the building</strong>
            <p>
              {property.hasLift
                ? "Shown as a lift on the listing."
                : property.floor && property.floor !== "Ground"
                  ? `Without a lift, that is ${property.floor} floor on foot.`
                  : "Turn on if the building has a working lift."}
            </p>
          </div>
          <Toggle
            checked={property.hasLift}
            onChange={() => !readOnly && patch({ hasLift: !property.hasLift })}
            label="Lift in the building"
          />
        </div>
      </section>

      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon coral" aria-hidden="true">
            <Car size={21} />
          </span>
          <div>
            <h3>Parking</h3>
            <p>Whether there is any, and what a resident has to do to get it.</p>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <strong>Parking available</strong>
            <p>Turn on to describe what is on offer.</p>
          </div>
          <Toggle
            checked={property.parking.available}
            onChange={() => !readOnly && patchParking({ available: !property.parking.available })}
            label="Parking available"
          />
        </div>

        {property.parking.available && (
          <>
            <div className="house-grid">
              <label>
                What fits
                <select
                  value={property.parking.type}
                  disabled={readOnly}
                  onChange={(event) => patchParking({ type: event.target.value as ParkingType })}
                >
                  {(Object.keys(PARKING_LABEL) as ParkingType[]).map((type) => (
                    <option key={type} value={type}>
                      {PARKING_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Spaces
                <input
                  type="number"
                  min="0"
                  max="99"
                  disabled={readOnly}
                  value={property.parking.spots}
                  onChange={(event) => patchParking({ spots: Number(event.target.value) || 0 })}
                />
              </label>
              <label>
                Monthly cost (&#2547;)
                <input
                  type="number"
                  min="0"
                  disabled={readOnly}
                  value={property.parking.monthlyCost}
                  onChange={(event) => patchParking({ monthlyCost: Number(event.target.value) || 0 })}
                />
                <small className="field-hint">
                  {property.parking.monthlyCost > 0
                    ? `${formatMoney(property.parking.monthlyCost)} on top of rent.`
                    : "Zero means it is included in the rent."}
                </small>
              </label>
            </div>

            <label className="stacked-field">
              How to get a space
              <textarea
                rows={3}
                maxLength={600}
                disabled={readOnly}
                value={property.parking.procedure}
                onChange={(event) => patchParking({ procedure: event.target.value })}
                placeholder="e.g. Ask the building caretaker, pay the society office by the 5th, sticker issued for the windscreen."
              />
            </label>
          </>
        )}
      </section>

      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon" aria-hidden="true">
            <MapPin size={21} />
          </span>
          <div>
            <h3>Map location</h3>
            <p>Drop a pin so people can see where the flat actually is.</p>
          </div>
        </div>

        <div className="house-map">
          {readOnly ? (
            <p className="muted-note">
              {property.coordinates
                ? `Pinned at ${property.coordinates.lat.toFixed(5)}, ${property.coordinates.lng.toFixed(5)}.`
                : "No pin has been dropped yet."}
            </p>
          ) : (
            <MapPicker
              value={property.coordinates}
              onChange={(coordinates) => patch({ coordinates })}
              onPlaceChosen={adoptPlace}
            />
          )}
        </div>

        <label className="stacked-field">
          Anything else worth knowing
          <textarea
            rows={3}
            maxLength={1000}
            disabled={readOnly}
            value={property.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder="e.g. Corner building opposite the pharmacy. Gate closes at midnight."
          />
        </label>
      </section>

      {isManager && (
        <div className={`settings-save ${dirty ? "dirty" : ""}`}>
          <span>{saved ? "House details saved" : dirty ? "You have unsaved changes" : "Everything is saved"}</span>
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
      )}
    </>
  );
}
