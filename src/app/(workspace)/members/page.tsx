import type { Metadata } from "next";
import { MembersView } from "@/components/views/members";

export const metadata: Metadata = { title: "Members" };

export default function MembersPage() {
  return <MembersView />;
}
