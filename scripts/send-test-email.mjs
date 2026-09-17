/**
 * Sends one real email, to prove the mail configuration works.
 *
 * The app never fails a request because email failed — an invitation that
 * cannot be delivered is still saved, and the problem only shows up as a line
 * in the server log. That is right for the app and useless for setting Resend
 * up, so this script does the opposite: it reports exactly what went wrong and
 * exits non-zero.
 *
 * It picks a transport the same way `src/lib/mail.ts` does, so "which transport
 * did it use" is the same answer the running app would give.
 *
 *   node --env-file=.env scripts/send-test-email.mjs you@example.com
 */

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: node --env-file=.env scripts/send-test-email.mjs you@example.com");
  process.exit(1);
}

const from = process.env.MESSMATE_MAIL_FROM?.trim() || "MessMate <onboarding@resend.dev>";
const appUrl = (process.env.MESSMATE_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

/** The same order of preference as mailTransport() in src/lib/mail.ts. */
function chooseTransport() {
  const explicit = process.env.MESSMATE_MAIL_TRANSPORT?.trim().toLowerCase();
  if (["console", "resend", "smtp", "disabled"].includes(explicit ?? "")) return explicit;
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  return "console";
}

const transport = chooseTransport();
console.info(`Transport: ${transport}`);
console.info(`From:      ${from}`);
console.info(`To:        ${to}`);
console.info(`App URL:   ${appUrl}`);
console.info("");

if (transport !== "resend") {
  console.error(
    [
      `Not configured for Resend — this run would use "${transport}".`,
      "",
      "Set these in .env, then run this again:",
      "  RESEND_API_KEY=re_...",
      "  MESSMATE_MAIL_FROM=MessMate <noreply@your-domain.com>",
      "  MESSMATE_APP_URL=https://your-deployment.example.com",
      "",
      "The From domain has to be one you have verified in Resend. Until you have",
      "verified one, onboarding@resend.dev works, but only to your own address.",
    ].join("\n"),
  );
  process.exit(1);
}

const subject = "MessMate test email";
const text = [
  "This is a test from the MessMate setup script.",
  "",
  "If you are reading it, Resend is configured correctly: invitations, welcome",
  "emails, password resets and monthly settlements will all go out the same way.",
  "",
  `Links in real emails will point at ${appUrl}`,
].join("\n");

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ from, to: [to], subject, text }),
});

if (!response.ok) {
  const detail = await response.text().catch(() => "");
  console.error(`Resend responded ${response.status}.`);
  console.error(detail.slice(0, 600));
  if (response.status === 401 || response.status === 403) {
    console.error("\nThat usually means RESEND_API_KEY is wrong, or has been revoked.");
  }
  if (response.status === 422) {
    console.error(
      "\nThat usually means the From address is on a domain you have not verified in Resend.",
    );
  }
  process.exit(1);
}

const body = await response.json().catch(() => ({}));
console.info(`Sent. Resend id: ${body.id ?? "(none returned)"}`);
console.info("If it does not arrive within a minute, check the spam folder and the Resend dashboard.");
