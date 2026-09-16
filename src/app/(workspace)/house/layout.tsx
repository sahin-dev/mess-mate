import type { Metadata } from "next";
import { HouseShell } from "@/components/views/house";

export const metadata: Metadata = { title: "House" };

export default function HouseLayout({ children }: { children: React.ReactNode }) {
  return <HouseShell>{children}</HouseShell>;
}
