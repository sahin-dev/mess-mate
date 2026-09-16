import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/server-utils";
import { JoinFlow } from "@/components/join-flow";

export const metadata: Metadata = { title: "Create or join a mess" };
export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const auth = await readSession();
  if (!auth) redirect("/signin");
  if (auth.user.isAdmin) redirect("/admin");
  // Already in a mess: nothing to choose.
  if (auth.session.activeMessId && auth.session.role) redirect("/");
  return <JoinFlow userName={auth.user.name} />;
}
