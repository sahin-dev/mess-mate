"use client";

import { AtSign, Eye, ImagePlus, KeyRound, Loader2, Phone, Trash2, UserRound } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { AVATAR_EDGE, AVATAR_QUALITY, MAX_AVATAR_BYTES } from "@/lib/avatar";
import { VISIBILITY_LABEL } from "@/lib/visibility";
import type { ProfileVisibility, Visibility } from "@/lib/types";
import { ActionButton, Avatar, SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

/**
 * Squares a picture in the browser before it is uploaded.
 *
 * An avatar is always drawn in a circle, so the middle square is the only part
 * of it anyone ever sees. Cropping to that here means the server never stores
 * pixels nobody will look at, and a 4 MB phone photo arrives as a few tens of
 * kilobytes.
 */
async function squareDownscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - edge) / 2);
  const sy = Math.round((bitmap.height - edge) / 2);
  const size = Math.min(AVATAR_EDGE, edge);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  context.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
  bitmap.close();

  // JPEG: a photo of a face gains nothing from PNG and costs several times more.
  return canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
}

export function ProfileView() {
  const { data } = useWorkspace();
  const { userName, userEmail, userPhone, userAvatarId, isDemo } = data.workspace;
  // Keying the details form on the saved values restarts it whenever the server
  // value changes, rather than copying props into state from an effect.
  const snapshot = `${userName}|${userEmail}|${userPhone}|${userAvatarId ?? ""}`;

  return (
    <>
      <SectionHeading
        kicker="YOUR ACCOUNT"
        title="Your profile"
        description="Your name, how the house can reach you, and the password you sign in with."
      />
      {isDemo ? (
        <div className="panel demo-profile-note">
          <span className="settings-icon coral" aria-hidden="true">
            <UserRound size={21} />
          </span>
          <div>
            <strong>This is the shared demo account</strong>
            <p>
              Everyone trying MessMate signs in as this same account, so its name, address,
              password and picture are fixed. Sign up for your own account to edit a profile.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ProfilePicture />
          <DetailsForm key={snapshot} />
          <VisibilityForm key={`v-${JSON.stringify(data.workspace.userVisibility)}`} />
          <PasswordForm />
        </>
      )}
    </>
  );
}

function ProfilePicture() {
  const { data, runAction, busy, notify, confirm } = useWorkspace();
  const { userName, userAvatarId } = data.workspace;
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await squareDownscale(file);
      // Base64 runs about a third larger than the bytes it encodes, and the
      // bytes are what the server measures, so check the same number here.
      const bytes = Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
      if (bytes > MAX_AVATAR_BYTES) {
        notify("That picture is too large. Try a smaller one.", "error");
        return;
      }
      await runAction("setAvatar", { data: dataUrl }, "Profile picture updated.");
    } catch {
      notify("That file could not be read as a picture.", "error");
    } finally {
      setUploading(false);
      // Clearing the input means picking the same file twice still fires.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = () =>
    confirm({
      title: "Remove your picture?",
      message: "Your initials will be shown instead, everywhere in the mess.",
      confirmLabel: "Remove picture",
      tone: "danger",
      onConfirm: async () => {
        await runAction("removeAvatar", {}, "Profile picture removed.");
      },
    });

  return (
    <section className="panel settings-section">
      <div className="settings-heading">
        <span className="settings-icon coral" aria-hidden="true">
          <ImagePlus size={21} />
        </span>
        <div>
          <h3>Profile picture</h3>
          <p>Shown next to your name on the roster, the balances and the members list.</p>
        </div>
      </div>

      <div className="setting-row profile-picture-row">
        <span className="profile-avatar">
          <Avatar name={userName} color="#c9603f" avatarId={userAvatarId} />
        </span>
        <div>
          <strong>{userAvatarId ? "Your picture" : "No picture yet"}</strong>
          <p>
            {userAvatarId
              ? "Only people in your mess can see it."
              : "Your initials are shown until you add one."}
          </p>
        </div>
        <div className="view-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            id="avatar-file"
            disabled={busy || uploading}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <label
            className={`button button-outline ${busy || uploading ? "is-disabled" : ""}`}
            htmlFor="avatar-file"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="spin" aria-hidden="true" /> Resizing…
              </>
            ) : (
              <>
                <ImagePlus size={16} aria-hidden="true" /> {userAvatarId ? "Replace" : "Upload"}
              </>
            )}
          </label>
          {userAvatarId && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy || uploading}
              onClick={remove}
            >
              <Trash2 size={16} aria-hidden="true" /> Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function DetailsForm() {
  const { data, runAction, busy } = useWorkspace();
  const { userName, userEmail, userPhone } = data.workspace;
  const [form, setForm] = useState({
    name: userName,
    email: userEmail,
    phone: userPhone,
    currentPassword: "",
  });

  const emailChanged = form.email.trim().toLowerCase() !== userEmail;
  const dirty = form.name.trim() !== userName || emailChanged || form.phone.trim() !== userPhone;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await runAction(
      "updateProfile",
      {
        name: form.name,
        email: form.email,
        phone: form.phone,
        ...(emailChanged ? { currentPassword: form.currentPassword } : {}),
      },
      "Your details have been saved.",
    );
    if (result) setForm((current) => ({ ...current, currentPassword: "" }));
  };

  return (
    <section className="panel settings-section">
      <div className="settings-heading">
        <span className="settings-icon" aria-hidden="true">
          <UserRound size={21} />
        </span>
        <div>
          <h3>Your details</h3>
          <p>Your name is what the rest of the mess sees on every list and every bill.</p>
        </div>
      </div>

      <form onSubmit={submit} className="profile-form">
        <label>
          Full name
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            autoComplete="name"
          />
        </label>

        <div className="form-grid">
          <label>
            <span className="label-with-icon">
              <AtSign size={14} aria-hidden="true" /> Email address
            </span>
            <input
              type="email"
              required
              maxLength={180}
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              autoComplete="email"
            />
          </label>
          <label>
            <span className="label-with-icon">
              <Phone size={14} aria-hidden="true" /> Phone (optional)
            </span>
            <input
              type="tel"
              maxLength={40}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="e.g. 01712 345678"
              autoComplete="tel"
            />
          </label>
        </div>

        {emailChanged && (
          <label>
            Current password
            <input
              type="password"
              required
              value={form.currentPassword}
              onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
              autoComplete="current-password"
            />
            <small className="field-note">
              This is the address you sign in with, so changing it needs your password. We will
              tell {userEmail} that it changed.
            </small>
          </label>
        )}

        <div className="view-actions">
          <ActionButton busy={busy} busyLabel="Saving…" type="submit" disabled={!dirty}>
            Save details
          </ActionButton>
        </div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const { runAction, busy, notify } = useWorkspace();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.newPassword.length < 8) {
      notify("Use a password of at least 8 characters.", "error");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      notify("The two new passwords do not match.", "error");
      return;
    }
    const result = await runAction(
      "changePassword",
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      "Your password has been changed.",
    );
    if (result) setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };

  const filled = form.currentPassword && form.newPassword && form.confirmPassword;

  return (
    <section className="panel settings-section">
      <div className="settings-heading">
        <span className="settings-icon" aria-hidden="true">
          <KeyRound size={21} />
        </span>
        <div>
          <h3>Password</h3>
          <p>Changing it signs you out everywhere else, but keeps you signed in here.</p>
        </div>
      </div>

      <form onSubmit={submit} className="profile-form">
        <label>
          Current password
          <input
            type="password"
            required
            value={form.currentPassword}
            onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
            autoComplete="current-password"
          />
        </label>

        <div className="form-grid">
          <label>
            New password
            <input
              type="password"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              required
              minLength={8}
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              autoComplete="new-password"
            />
          </label>
        </div>
        <small className="field-note">At least 8 characters.</small>

        <div className="view-actions">
          <ActionButton busy={busy} busyLabel="Changing…" type="submit" disabled={!filled}>
            Change password
          </ActionButton>
        </div>
      </form>
    </section>
  );
}

const VISIBILITY_FIELDS = [
  {
    key: "avatar" as const,
    label: "Profile picture",
    hint: {
      private: "Nobody but you sees it — not even your manager.",
      mess: "The people you live with see it. Nobody outside the mess does.",
      public: "Shown beside any to-let post you write, where anyone can see it.",
    },
  },
  {
    key: "email" as const,
    label: "Email address",
    hint: {
      private: "Hidden from your housemates. Your manager can still see it.",
      mess: "The people you live with can see it on the members list.",
      public: "Offered as the contact address when you write a to-let post.",
    },
  },
  {
    key: "phone" as const,
    label: "Phone number",
    hint: {
      private: "Hidden from your housemates. Your manager can still see it.",
      mess: "The people you live with can see it on the members list.",
      public: "Offered as the contact number when you write a to-let post.",
    },
  },
];

function VisibilityForm() {
  const { data, runAction, busy } = useWorkspace();
  const saved = data.workspace.userVisibility;
  const [visibility, setVisibility] = useState<ProfileVisibility>(saved);

  const dirty = VISIBILITY_FIELDS.some((field) => visibility[field.key] !== saved[field.key]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runAction("updateVisibility", { visibility }, "Privacy settings saved.");
  };

  return (
    <section className="panel settings-section">
      <div className="settings-heading">
        <span className="settings-icon" aria-hidden="true">
          <Eye size={21} />
        </span>
        <div>
          <h3>Who can see what</h3>
          <p>Your name is always visible to the mess — it is how bills and meals are labelled.</p>
        </div>
      </div>

      <form onSubmit={submit} className="profile-form">
        {VISIBILITY_FIELDS.map((field) => {
          const current = visibility[field.key];
          return (
            <div className="visibility-row" key={field.key}>
              <div>
                <strong>{field.label}</strong>
                <p>{field.hint[current]}</p>
              </div>
              <div className="visibility-choices" role="group" aria-label={`Who can see your ${field.label.toLowerCase()}`}>
                {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={current === level ? "selected" : ""}
                    aria-pressed={current === level}
                    onClick={() => setVisibility({ ...visibility, [field.key]: level })}
                  >
                    {VISIBILITY_LABEL[level]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="view-actions">
          <ActionButton busy={busy} busyLabel="Saving…" type="submit" disabled={!dirty}>
            Save privacy settings
          </ActionButton>
        </div>
      </form>
    </section>
  );
}
