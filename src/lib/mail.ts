import { isProduction } from "@/lib/env";

/**
 * Outbound email.
 *
 * Three transports, chosen by environment so a developer needs no account and a
 * deployment is not tied to one vendor:
 *
 *   - `console` (default off-production): prints the message to the server log.
 *   - `resend`:  HTTP API, needs only RESEND_API_KEY, no dependency.
 *   - `smtp`:    any SMTP server, spoken directly over TLS.
 *
 * Sending never throws into a request. A mess invitation that fails to send is
 * worth logging and surfacing, but it must not roll back the invitation itself.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain text is required; HTML is optional and falls back to the text. */
  text: string;
  html?: string;
  replyTo?: string;
};

export type MailResult = { ok: true; transport: string } | { ok: false; error: string };

export type MailTransport = "console" | "resend" | "smtp" | "disabled";

export function mailTransport(): MailTransport {
  const explicit = process.env.MESSMATE_MAIL_TRANSPORT?.trim().toLowerCase();
  if (explicit === "console" || explicit === "resend" || explicit === "smtp" || explicit === "disabled") {
    return explicit;
  }
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  // Printing invitations to the log is helpful locally and wrong in production.
  return isProduction() ? "disabled" : "console";
}

export function mailFrom() {
  return process.env.MESSMATE_MAIL_FROM?.trim() || "MessMate <onboarding@resend.dev>";
}

/** Absolute base URL for links inside emails. */
export function appUrl(path = "/") {
  const base = (process.env.MESSMATE_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** True when mail actually leaves the server, so the UI can tell the truth. */
export function mailIsDelivered() {
  const transport = mailTransport();
  return transport === "resend" || transport === "smtp";
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = mailTransport();
  try {
    switch (transport) {
      case "disabled":
        return { ok: false, error: "Email is not configured on this deployment." };
      case "console":
        console.info(
          [
            "",
            "──────── email (console transport) ────────",
            `To:      ${message.to}`,
            `From:    ${mailFrom()}`,
            `Subject: ${message.subject}`,
            "",
            message.text,
            "───────────────────────────────────────────",
            "",
          ].join("\n"),
        );
        return { ok: true, transport };
      case "resend":
        await sendViaResend(message);
        return { ok: true, transport };
      case "smtp":
        await sendViaSmtp(message);
        return { ok: true, transport };
    }
  } catch (error) {
    // The address is logged, never the body, which can contain a reset link.
    console.error(`[messmate] email to ${message.to} failed via ${transport}`, error);
    return { ok: false, error: error instanceof Error ? error.message : "Email could not be sent." };
  }
}

/** Sends to several people without letting one failure stop the rest. */
export async function sendMailBatch(messages: MailMessage[]) {
  const results = await Promise.all(messages.map((message) => sendMail(message)));
  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  };
}

async function sendViaResend(message: MailMessage) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendViaSmtp(message: MailMessage) {
  // Imported lazily so a deployment that uses Resend never loads the SMTP code.
  const { sendSmtp } = await import("@/lib/smtp");
  await sendSmtp(message);
}
