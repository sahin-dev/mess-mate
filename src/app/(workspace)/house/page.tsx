import type { Metadata } from "next";
import { BuildingTab } from "@/components/views/house-building";

export const metadata: Metadata = { title: "House" };

export default function BuildingPage() {
  return <BuildingTab />;
}
