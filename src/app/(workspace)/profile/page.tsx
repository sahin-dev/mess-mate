import type { Metadata } from "next";
import { ProfileView } from "@/components/views/profile";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return <ProfileView />;
}
