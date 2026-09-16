import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/server-utils";
import { ListingsTab } from "@/components/views/house-listings";

export const metadata: Metadata = { title: "Community listings" };
export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  // Publishing exposes the house publicly, so the check is on the server too.
  const auth = await readSession();
  if (auth?.session.role !== "manager" && auth?.session.role !== "admin") redirect("/house");
  return <ListingsTab />;
}
