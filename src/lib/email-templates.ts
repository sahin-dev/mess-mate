import { appUrl, type MailMessage } from "@/lib/mail";

/**
 * Every message is written plain-text first, because that is what the spam
 * filters read and what a screen reader gets. The HTML is a light wrapper over
 * the same words, with inline styles because email clients strip stylesheets.
 */

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function layout({ heading, body, action }: { heading: string; body: string[]; action?: { label: string; href: string } }) {
  const paragraphs = body
    .map(
      (line) =>
        `<p style="margin:0 0 14px;color:#3c4c45;font-size:15px;line-height:1.6;">${line}</p>`,
    )
    .join("");
  const button = action
    ? `<p style="margin:24px 0 8px;"><a href="${escapeHtml(action.href)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#17402f;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 14px;color:#77857d;font-size:12px;line-height:1.6;">If the button does not work, copy this link into your browser:<br>${escapeHtml(action.href)}</p>`
    : "";

  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f6f3;font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
    <tr><td style="padding:0 0 18px;">
      <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#17402f;">MessMate</span>
    </td></tr>
    <tr><td style="padding:28px;border:1px solid #dfe5e0;border-radius:16px;background:#ffffff;">
      <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#16241f;">${escapeHtml(heading)}</h1>
      ${paragraphs}
      ${button}
    </td></tr>
    <tr><td style="padding:16px 4px;color:#77857d;font-size:12px;line-height:1.6;">
      You are receiving this because someone used your address in a MessMate mess.
    </td></tr>
  </table>
</body></html>`;
}

export function invitationEmail(options: {
  to: string;
  messName: string;
  inviterName: string;
  joinCode: string;
  location?: string;
}): MailMessage {
  const link = appUrl(`/join?code=${encodeURIComponent(options.joinCode)}`);
  const where = options.location ? ` in ${options.location}` : "";

  const text = [
    `${options.inviterName} has invited you to join ${options.messName}${where} on MessMate.`,
    "",
    "MessMate keeps a shared home's meals, grocery runs and bills in one place,",
    "and works out who owes whom at the end of the month.",
    "",
    `Your join code is: ${options.joinCode}`,
    "",
    `Join here: ${link}`,
    "",
    "If you were not expecting this, you can ignore this email. Nothing happens",
    "until you sign up and enter the code.",
  ].join("\n");

  return {
    to: options.to,
    subject: `${options.inviterName} invited you to ${options.messName}`,
    text,
    html: layout({
      heading: `Join ${options.messName}`,
      body: [
        `<strong>${escapeHtml(options.inviterName)}</strong> has invited you to join <strong>${escapeHtml(options.messName)}</strong>${escapeHtml(where)} on MessMate.`,
        "MessMate keeps a shared home's meals, grocery runs and bills in one place, and works out who owes whom at the end of the month.",
        `Your join code is <strong style="letter-spacing:1px;">${escapeHtml(options.joinCode)}</strong>.`,
        "If you were not expecting this you can ignore this email — nothing happens until you sign up and enter the code.",
      ],
      action: { label: "Join the mess", href: link },
    }),
  };
}

export function passwordResetEmail(options: {
  to: string;
  name: string;
  token: string;
  minutesValid: number;
}): MailMessage {
  const link = appUrl(`/reset?token=${encodeURIComponent(options.token)}`);
  const text = [
    `Hello ${options.name},`,
    "",
    "Someone asked to reset the password on your MessMate account.",
    "",
    `Reset it here: ${link}`,
    "",
    `This link works once and expires in ${options.minutesValid} minutes.`,
    "",
    "If this was not you, ignore this email. Your password stays as it is and",
    "nobody can use this link without your inbox.",
  ].join("\n");

  return {
    to: options.to,
    subject: "Reset your MessMate password",
    text,
    html: layout({
      heading: "Reset your password",
      body: [
        `Hello ${escapeHtml(options.name)}, someone asked to reset the password on your MessMate account.`,
        `This link works once and expires in ${options.minutesValid} minutes.`,
        "If this was not you, ignore this email. Your password stays as it is.",
      ],
      action: { label: "Choose a new password", href: link },
    }),
  };
}

export function cutoffReminderEmail(options: {
  to: string;
  name: string;
  messName: string;
  cutoff: string;
  recorded: boolean;
}): MailMessage {
  const link = appUrl("/meals");
  const lead = options.recorded
    ? `Your meals for today at ${options.messName} are recorded. You can still change them until ${options.cutoff}.`
    : `You have not recorded any meals for today at ${options.messName}. Entries close at ${options.cutoff}, after which today counts as zero.`;

  return {
    to: options.to,
    subject: options.recorded
      ? `Meal entry closes at ${options.cutoff}`
      : `No meals recorded today — closes at ${options.cutoff}`,
    text: [`Hello ${options.name},`, "", lead, "", `Open the meal planner: ${link}`].join("\n"),
    html: layout({
      heading: options.recorded ? "Entry closes soon" : "No meals recorded today",
      body: [`Hello ${escapeHtml(options.name)},`, escapeHtml(lead)],
      action: { label: "Open the meal planner", href: link },
    }),
  };
}

export function rosterReminderEmail(options: {
  to: string;
  name: string;
  messName: string;
  date: string;
}): MailMessage {
  const link = appUrl("/bazar");
  const lead = `You are on bazar duty for ${options.messName} tomorrow, ${options.date}.`;
  return {
    to: options.to,
    subject: `Your bazar turn is tomorrow`,
    text: [
      `Hello ${options.name},`,
      "",
      lead,
      "",
      "Remember to record what you bought and the total afterwards, so it counts",
      "towards the meal rate.",
      "",
      `Open the bazar ledger: ${link}`,
    ].join("\n"),
    html: layout({
      heading: "Bazar duty tomorrow",
      body: [
        `Hello ${escapeHtml(options.name)},`,
        escapeHtml(lead),
        "Remember to record what you bought and the total afterwards, so it counts towards the meal rate.",
      ],
      action: { label: "Open the bazar ledger", href: link },
    }),
  };
}

export function settlementEmail(options: {
  to: string;
  name: string;
  messName: string;
  periodLabel: string;
  mealRate: string;
  meals: number;
  paid: string;
  owed: string;
  balance: number;
  balanceText: string;
  transfers: string[];
}): MailMessage {
  const link = appUrl("/expenses");
  const verdict =
    Math.abs(options.balance) < 1
      ? "You are square."
      : options.balance > 0
        ? `The mess owes you ${options.balanceText}.`
        : `You owe the mess ${options.balanceText}.`;

  const text = [
    `Hello ${options.name},`,
    "",
    `${options.periodLabel} is closed at ${options.messName}.`,
    "",
    `Meal rate:  ${options.mealRate} per meal`,
    `Your meals: ${options.meals}`,
    `You paid:   ${options.paid}`,
    `You used:   ${options.owed}`,
    "",
    verdict,
    ...(options.transfers.length ? ["", "To settle up:", ...options.transfers.map((line) => `  ${line}`)] : []),
    "",
    `Full breakdown: ${link}`,
  ].join("\n");

  return {
    to: options.to,
    subject: `${options.periodLabel} settlement for ${options.messName}`,
    text,
    html: layout({
      heading: `${options.periodLabel} settlement`,
      body: [
        `Hello ${escapeHtml(options.name)}, ${escapeHtml(options.periodLabel)} is closed at <strong>${escapeHtml(options.messName)}</strong>.`,
        `Meal rate <strong>${escapeHtml(options.mealRate)}</strong> per meal · your meals <strong>${options.meals}</strong>`,
        `You paid <strong>${escapeHtml(options.paid)}</strong> and used <strong>${escapeHtml(options.owed)}</strong>.`,
        `<strong>${escapeHtml(verdict)}</strong>`,
        ...(options.transfers.length
          ? [`To settle up:<br>${options.transfers.map(escapeHtml).join("<br>")}`]
          : []),
      ],
      action: { label: "See the full breakdown", href: link },
    }),
  };
}

export function welcomeEmail(options: { to: string; name: string }): MailMessage {
  const link = appUrl("/join");
  const text = [
    `Welcome to MessMate, ${options.name}.`,
    "",
    "Your account is ready. MessMate keeps a shared home's meals, grocery runs",
    "and bills in one place, and works out who owes whom at the end of the month.",
    "",
    "The next step is to join a mess. If someone invited you, they will have sent",
    "you a join code. If you are setting one up yourself, you can create it from",
    "the same page and invite everyone else afterwards.",
    "",
    `Start here: ${link}`,
    "",
    "If you did not create this account, please ignore this email.",
  ].join("\n");

  return {
    to: options.to,
    subject: "Welcome to MessMate",
    text,
    html: layout({
      heading: `Welcome, ${options.name}`,
      body: [
        "Your account is ready. MessMate keeps a shared home's meals, grocery runs and bills in one place, and works out who owes whom at the end of the month.",
        "The next step is to join a mess. If someone invited you, they will have sent you a join code — and if you are setting one up yourself, you can create it from the same page and invite everyone else afterwards.",
        "If you did not create this account, please ignore this email.",
      ],
      action: { label: "Join or create a mess", href: link },
    }),
  };
}

/**
 * Sent to the address being moved *away* from, which is the only warning an
 * account has if someone else changed it.
 */
export function emailChangedEmail(options: {
  to: string;
  name: string;
  newEmail: string;
}): MailMessage {
  const text = [
    `Hello ${options.name},`,
    "",
    `The email address on your MessMate account was changed to ${options.newEmail}.`,
    "You will need to sign in with the new address from now on.",
    "",
    "If you made this change, there is nothing to do.",
    "",
    "If you did not, someone else knows your password. Reset it straight away",
    `from ${appUrl("/signin")} using the new address, and contact your mess manager.`,
  ].join("\n");

  return {
    to: options.to,
    subject: "Your MessMate email address was changed",
    text,
    html: layout({
      heading: "Your email address was changed",
      body: [
        `Hello ${escapeHtml(options.name)}, the email address on your MessMate account was changed to <strong>${escapeHtml(options.newEmail)}</strong>. You will need to sign in with the new address from now on.`,
        "If you made this change, there is nothing to do.",
        "If you did not, someone else knows your password — reset it straight away using the new address, and contact your mess manager.",
      ],
      action: { label: "Go to MessMate", href: appUrl("/signin") },
    }),
  };
}
