import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/server-utils";
import { AdminPortal } from "@/components/admin-portal";
import { isAdminView } from "@/lib/admin-views";

export const metadata: Metadata = { title: "Platform administration" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const auth = await readSession();
  if (!auth) redirect("/signin");
  if (!auth.user.isAdmin) redirect("/dashboard");
  const { view } = await searchParams;
  const initialView = isAdminView(view) ? view : "overview";
  return <AdminPortal userName={auth.user.name} initialView={initialView} />;
}
