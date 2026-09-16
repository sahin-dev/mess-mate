import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/server-utils";
import { AdminPortal } from "@/components/admin-portal";

export const metadata: Metadata = { title: "Platform administration" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await readSession();
  if (!auth) redirect("/signin");
  if (!auth.user.isAdmin) redirect("/");
  return <AdminPortal userName={auth.user.name} />;
}
