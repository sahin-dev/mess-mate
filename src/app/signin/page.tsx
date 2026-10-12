import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoEnabled } from "@/lib/env";
import { readSession } from "@/lib/server-utils";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const inviteCode = /^[A-Za-z0-9-]{6,20}$/.test(params.code ?? "")
    ? params.code!.toUpperCase()
    : null;
  const auth = await readSession();
  if (auth) {
    if (auth.user.isAdmin) redirect("/admin");
    redirect(auth.session.activeMessId ? "/dashboard" : inviteCode ? `/join?code=${encodeURIComponent(inviteCode)}` : "/join");
  }
  return <SignInForm demoEnabled={demoEnabled()} inviteCode={inviteCode} />;
}
