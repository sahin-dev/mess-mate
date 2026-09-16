import type { Metadata } from "next";
import { RoomsView } from "@/components/views/rooms";

export const metadata: Metadata = { title: "Rooms" };

export default function RoomsPage() {
  return <RoomsView />;
}
