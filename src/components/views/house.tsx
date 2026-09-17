"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { propertySummary } from "@/lib/property";
import { SectionHeading } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";

const TABS = [
  { href: "/house", label: "Building & flat" },
  { href: "/house/rooms", label: "Rooms" },
  { href: "/house/facilities", label: "Facilities" },
  { href: "/house/listings", label: "Community" },
];

/**
 * The house is one subject with four faces, so it is one section with tabs
 * rather than four unrelated entries in the sidebar.
 */
export function HouseShell({ children }: { children: React.ReactNode }) {
  const { data } = useWorkspace();
  const pathname = usePathname();
  const summary = propertySummary(data.property);

  return (
    <>
      <SectionHeading
        kicker="THE HOUSE"
        title={data.workspace.messName}
        description={summary || "Add the address, rooms and facilities so everyone has the details."}
      />

      {/* These navigate between pages, so they are links marked with
          aria-current — not an ARIA tablist, which would promise arrow-key
          navigation and a tabpanel that do not exist here. */}
      <nav className="settings-nav" aria-label="House sections">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? "page" : undefined}
            className={pathname === tab.href ? "active" : ""}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </>
  );
}
