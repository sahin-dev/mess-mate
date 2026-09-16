import type { Metadata } from "next";
import { FacilitiesTab } from "@/components/views/house-facilities";

export const metadata: Metadata = { title: "Facilities" };

export default function FacilitiesPage() {
  return <FacilitiesTab />;
}
