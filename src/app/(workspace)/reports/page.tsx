import type { Metadata } from "next";
import { MonthlyReport } from "@/components/views/monthly-report";

export const metadata: Metadata = { title: "Monthly report" };

export default function ReportsPage() {
  return <MonthlyReport />;
}
