import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoEnabled } from "@/lib/env";
import { readSession } from "@/lib/server-utils";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const auth = await readSession();
  if (auth) {
    if (auth.user.isAdmin) redirect("/admin");
    redirect(auth.session.activeMessId ? "/dashboard" : "/join");
  }
  return <SignInForm demoEnabled={demoEnabled()} />;
}
