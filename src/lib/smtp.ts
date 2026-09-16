import nodemailer, { type Transporter } from "nodemailer";
import { mailFrom, type MailMessage } from "@/lib/mail";

/**
 * SMTP delivery.
 *
 * Kept in its own module so the mail layer can import it lazily: a deployment
 * using the HTTP transport never loads nodemailer at all.
 */

let transporter: Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  if (!host) throw new Error("SMTP_HOST is not configured.");

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  transporter = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 and 25 start plain and upgrade with STARTTLS.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: user ? { user, pass } : undefined,
    // Reuse one connection for a burst of reminders instead of reconnecting.
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendSmtp(message: MailMessage) {
  await getTransporter().sendMail({
    from: mailFrom(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo,
  });
}

/** Used by the health endpoint and the settings page to prove the config works. */
export async function verifySmtp() {
  await getTransporter().verify();
}
