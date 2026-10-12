import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/server-utils";
import { SettingsView } from "@/components/views/settings";

export const metadata: Metadata = { title: "Mess settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Settings change the rules for everyone, so the check belongs on the server
  // as well as in the navigation.
  const auth = await readSession();
  if (auth?.session.role !== "manager" && auth?.session.role !== "admin") redirect("/dashboard");
  const tab = (await searchParams).tab;
  return <SettingsView initialTab={tab === "expenses" ? "expenses" : "general"} />;
}
