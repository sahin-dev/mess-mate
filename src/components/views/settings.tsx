"use client";

import {
  Bell,
  Check,
  CircleDollarSign,
  Clock3,
  KeyRound,
  Plus,
  ShoppingBasket,
  Globe,
  Trash2,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  browserTimezone,
  clockInZone,
  COMMON_TIMEZONES,
  isValidTimezone,
  timezoneOffsetLabel,
} from "@/lib/timezone";
import type { MealKey, MessSettings } from "@/lib/types";
import { ActionButton, CopyButton, SectionHeading, Toggle } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

type SettingsTab = "general" | "meals" | "bazar" | "expenses" | "notifications";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "meals", label: "Meals" },
  { id: "bazar", label: "Bazar rules" },
  { id: "expenses", label: "Fixed bills" },
  { id: "notifications", label: "Notifications" },
];

const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export function SettingsView() {
  const { data } = useWorkspace();
  // Keying the form on the saved settings restarts it whenever the server
  // value changes, instead of copying props into state from an effect.
  const serverSnapshot = JSON.stringify(data.settings);
  return <SettingsForm key={serverSnapshot} serverSnapshot={serverSnapshot} />;
}

function SettingsForm({ serverSnapshot }: { serverSnapshot: string }) {
  const { data, runAction, busy, confirm } = useWorkspace();
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<MessSettings>(() => structuredClone(data.settings));
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  const dirty = JSON.stringify(settings) !== serverSnapshot;
  const patch = (changes: Partial<MessSettings>) => setSettings({ ...settings, ...changes });

  const save = async () => {
    const result = await runAction("saveSettings", { settings }, "Mess settings saved.");
    if (result) setJustSaved(true);
  };

  const regenerate = () =>
    confirm({
      title: "Generate a new join code?",
      message:
        "The current code stops working immediately. Anyone who has not joined yet will need the new one.",
      confirmLabel: "Generate new code",
      onConfirm: async () => {
        await runAction("regenerateJoinCode", {}, "New join code generated.");
      },
    });

  return (
    <>
      <SectionHeading
        kicker="MANAGER CONTROLS"
        title="Mess settings"
        description="Set the rules once. MessMate applies them to everyone in the mess."
      />

      <div className="settings-nav" role="tablist" aria-label="Settings sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "general" && (
          <section className="panel settings-section">
            <div className="settings-heading">
              <span className="settings-icon coral" aria-hidden="true">
                <KeyRound size={21} />
              </span>
              <div>
                <h3>Private join code</h3>
                <p>Anyone with this code can join. Regenerating it disables the old one at once.</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong className="code-display">{data.workspace.joinCode}</strong>
                <p>Share it only with people you actually live with.</p>
              </div>
              <div className="view-actions">
                <CopyButton value={data.workspace.joinCode} className="button button-outline" />
                <button type="button" className="button button-outline" disabled={busy} onClick={regenerate}>
                  Regenerate
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Mess name</strong>
                <p>
                  {data.workspace.messName} &middot; {data.workspace.location}
                </p>
              </div>
            </div>
          </section>
        )}

        {tab === "meals" && (
          <section className="panel settings-section">
            <div className="settings-heading">
              <span className="settings-icon" aria-hidden="true">
                <Utensils size={21} />
              </span>
              <div>
                <h3>Meal entry</h3>
                <p>Which meals you serve, and when members can still change their count.</p>
              </div>
            </div>

            <div className="setting-row block">
              <div>
                <strong>Meals served</strong>
                <p>Members only see an entry field for the meals you select.</p>
              </div>
              <div className="meal-checkboxes">
                {(Object.keys(MEAL_LABEL) as MealKey[]).map((key) => {
                  const selected = settings.mealTypes[key];
                  return (
                    <button
                      type="button"
                      key={key}
                      className={selected ? "selected" : ""}
                      aria-pressed={selected}
                      onClick={() =>
                        patch({ mealTypes: { ...settings.mealTypes, [key]: !selected } })
                      }
                    >
                      <span aria-hidden="true">{selected && <Check size={13} />}</span>
                      {MEAL_LABEL[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            <SettingToggle
              title="Members can edit any day"
              description="When off, today's entry closes at the cutoff and past days are manager-only."
              checked={settings.allowAnytime}
              onChange={() => patch({ allowAnytime: !settings.allowAnytime })}
            />

            {!settings.allowAnytime && (
              <div className="setting-row">
                <div>
                  <strong>Daily cutoff</strong>
                  <p>
                    Anything not entered by this time counts as zero for the day, measured in{" "}
                    {settings.timezone.replace(/_/g, " ")}.
                  </p>
                </div>
                <label className="time-input">
                  <Clock3 size={15} aria-hidden="true" />
                  <span className="visually-hidden">Daily meal cutoff</span>
                  <input
                    type="time"
                    value={settings.cutoff}
                    onChange={(event) => patch({ cutoff: event.target.value })}
                  />
                </label>
              </div>
            )}

            <TimezoneRow
              value={settings.timezone}
              onChange={(timezone) => patch({ timezone })}
            />

            <SettingToggle
              title="Manager approval for meal changes"
              description="Entries are marked pending until a manager reviews them."
              checked={settings.mealApproval}
              onChange={() => patch({ mealApproval: !settings.mealApproval })}
            />
          </section>
        )}

        {tab === "bazar" && (
          <section className="panel settings-section">
            <div className="settings-heading">
              <span className="settings-icon coral" aria-hidden="true">
                <ShoppingBasket size={21} />
              </span>
              <div>
                <h3>Bazar rules</h3>
                <p>How grocery runs are submitted, proved and approved.</p>
              </div>
            </div>
            <SettingToggle
              title="Require manager approval"
              description="Entries stay pending, and out of the meal rate, until approved."
              checked={settings.bazarApproval}
              onChange={() => patch({ bazarApproval: !settings.bazarApproval })}
            />
            <SettingToggle
              title="Require a receipt photo"
              description="Members must attach a photo of the receipt with every entry."
              checked={settings.requireProof}
              onChange={() => patch({ requireProof: !settings.requireProof })}
            />
            <div className="setting-row">
              <div>
                <strong>Duty rotation</strong>
                <p>How often bazar duty moves to the next member.</p>
              </div>
              <label>
                <span className="visually-hidden">Roster frequency</span>
                <select
                  className="control-select"
                  value={settings.rosterFrequency}
                  onChange={(event) =>
                    patch({ rosterFrequency: event.target.value as MessSettings["rosterFrequency"] })
                  }
                >
                  <option value="alternate">Every other day</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Once a week</option>
                  <option value="custom">Custom schedule</option>
                </select>
              </label>
            </div>
          </section>
        )}

        {tab === "expenses" && (
          <section className="panel settings-section">
            <div className="settings-heading">
              <span className="settings-icon blue" aria-hidden="true">
                <CircleDollarSign size={21} />
              </span>
              <div>
                <h3>Fixed monthly bills</h3>
                <p>
                  A reminder list of what recurs each month. Add them as expenses to include them in
                  the settlement.
                </p>
              </div>
            </div>
            <ul className="fixed-list">
              {settings.fixedExpenses.map((expense, index) => (
                <li key={expense.id}>
                  <span className="fixed-symbol" aria-hidden="true">
                    {expense.title[0]?.toUpperCase() ?? "?"}
                  </span>
                  <label className="inline-field">
                    <span className="visually-hidden">Title</span>
                    <input
                      value={expense.title}
                      maxLength={80}
                      onChange={(event) =>
                        patch({
                          fixedExpenses: settings.fixedExpenses.map((item, position) =>
                            position === index ? { ...item, title: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="inline-field">
                    <span className="visually-hidden">Amount</span>
                    <input
                      type="number"
                      min="0"
                      value={expense.amount}
                      onChange={(event) =>
                        patch({
                          fixedExpenses: settings.fixedExpenses.map((item, position) =>
                            position === index
                              ? { ...item, amount: Number(event.target.value) || 0 }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <small>
                    {formatMoney(expense.amount / Math.max(1, data.workspace.memberCount))} each
                  </small>
                  <button
                    type="button"
                    className="icon-action danger"
                    title={`Remove ${expense.title}`}
                    aria-label={`Remove ${expense.title}`}
                    onClick={() =>
                      patch({
                        fixedExpenses: settings.fixedExpenses.filter((item) => item.id !== expense.id),
                      })
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {settings.fixedExpenses.length === 0 && (
                <li className="muted-note">No recurring bills listed yet.</li>
              )}
            </ul>
            <button
              type="button"
              className="add-inline"
              onClick={() =>
                patch({
                  fixedExpenses: [
                    ...settings.fixedExpenses,
                    {
                      id: `fixed_${Date.now()}`,
                      title: "New monthly bill",
                      amount: 1000,
                    },
                  ],
                })
              }
            >
              <Plus size={16} aria-hidden="true" /> Add a fixed bill
            </button>
          </section>
        )}

        {tab === "notifications" && (
          <section className="panel settings-section">
            <div className="settings-heading">
              <span className="settings-icon blue" aria-hidden="true">
                <Bell size={21} />
              </span>
              <div>
                <h3>Reminders</h3>
                <p>
                  {data.emailEnabled
                    ? `Sent by email in ${settings.timezone.replace(/_/g, " ")} time, to members who have not already acted.`
                    : "Email is not configured on this deployment, so nothing is delivered. These preferences are stored and take effect once it is."}
                </p>
              </div>
            </div>
            <SettingToggle
              title="Meal cutoff reminder"
              description={`Sent an hour before ${settings.cutoff}, only to members with nothing recorded that day.`}
              checked={settings.notifications.cutoff}
              onChange={() =>
                patch({
                  notifications: { ...settings.notifications, cutoff: !settings.notifications.cutoff },
                })
              }
            />
            <SettingToggle
              title="Bazar duty reminder"
              description="Sent to whoever is on duty, the day before their turn."
              checked={settings.notifications.roster}
              onChange={() =>
                patch({
                  notifications: { ...settings.notifications, roster: !settings.notifications.roster },
                })
              }
            />
            <SettingToggle
              title="Monthly settlement summary"
              description="Sent on the first of the month with everyone's closing balance."
              checked={settings.notifications.settlement}
              onChange={() =>
                patch({
                  notifications: {
                    ...settings.notifications,
                    settlement: !settings.notifications.settlement,
                  },
                })
              }
            />
          </section>
        )}
      </div>

      <div className={`settings-save ${dirty ? "dirty" : ""}`}>
        <span>
          {justSaved ? (
            <>
              <Check size={14} aria-hidden="true" /> Settings saved
            </>
          ) : dirty ? (
            "You have unsaved changes"
          ) : (
            "Everything is saved"
          )}
        </span>
        <ActionButton
          busy={busy}
          busyLabel="Saving…"
          className={`button ${justSaved ? "button-success" : "button-dark"}`}
          onClick={save}
          disabled={!dirty}
        >
          Save changes
        </ActionButton>
      </div>
    </>
  );
}

/**
 * The mess's timezone decides what "today" means and when the cutoff bites, so
 * the picker shows the resulting local clock and warns when it differs from the
 * one the manager is sitting in.
 */
function TimezoneRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [viewerZone] = useState(() => browserTimezone());
  const [tick, setTick] = useState(() => Date.now());
  const [custom, setCustom] = useState(() => !COMMON_TIMEZONES.includes(value));
  const [draft, setDraft] = useState(value);

  // A ticking clock is the clearest proof the choice is the intended one.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = new Date(tick);
  const options = COMMON_TIMEZONES.includes(value) ? COMMON_TIMEZONES : [value, ...COMMON_TIMEZONES];

  return (
    <div className="setting-row block">
      <div>
        <strong>Mess timezone</strong>
        <p>
          Used for the cutoff, for which day counts as today, and for when
          reminders are sent.
        </p>
        {viewerZone !== value && (
          <p className="timezone-warning">
            <Globe size={13} aria-hidden="true" /> Your device is in{" "}
            {viewerZone.replace(/_/g, " ")}, so times here will not match your own clock.
          </p>
        )}
      </div>
      <div className="timezone-control">
        {custom ? (
          <input
            className="control-select"
            value={draft}
            spellCheck={false}
            aria-label="IANA timezone name"
            placeholder="Region/City"
            onChange={(event) => {
              setDraft(event.target.value);
              if (isValidTimezone(event.target.value)) onChange(event.target.value);
            }}
          />
        ) : (
          <label>
            <span className="visually-hidden">Mess timezone</span>
            <select
              className="control-select"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            >
              {options.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")} ({timezoneOffsetLabel(zone, now)})
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="timezone-clock">
          It is <strong>{clockInZone(value, now)}</strong> there now
          {custom && !isValidTimezone(draft) ? " — that name is not recognised" : ""}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setCustom((was) => !was);
            setDraft(value);
          }}
        >
          {custom ? "Choose from the list" : "Enter another IANA name"}
        </button>
      </div>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
