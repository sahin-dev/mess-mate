import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bazar & groceries" };

export default function BazarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
