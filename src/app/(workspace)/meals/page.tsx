import type { Metadata } from "next";
import { MealsView } from "@/components/views/meals";

export const metadata: Metadata = { title: "Meals" };

export default function MealsPage() {
  return <MealsView />;
}
