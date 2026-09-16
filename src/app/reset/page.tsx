import type { Metadata } from "next";
import { ResetLinkProblem, ResetPasswordForm } from "@/components/reset-password-form";

export const metadata: Metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // The token is only checked when the new password is submitted, so a missing
  // one is the only thing worth rejecting here.
  if (!token || token.length < 20) return <ResetLinkProblem />;
  return <ResetPasswordForm token={token} />;
}
