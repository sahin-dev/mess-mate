import { redirect } from "next/navigation";
import { getWorkspaceData } from "@/lib/data";
import { adoptMembership, readSession } from "@/lib/server-utils";
import { WorkspaceShell } from "@/components/workspace-shell";

// Everything here depends on the signed-in member, so nothing is prerendered.
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const auth = await readSession();
  if (!auth) redirect("/signin");

  const { db, session, user } = auth;
  // A platform administrator has their own console.
  if (user.isAdmin) redirect("/admin");
  // Pick up a membership approved since this session began.
  const adopted = await adoptMembership(db, session, user);
  const messId = session.activeMessId ?? adopted?.messId;
  const role = session.role ?? adopted?.role;
  if (!messId || !role) redirect("/join");

  // Rendering on the server means the dashboard arrives populated, instead of
  // flashing a loading screen while the browser fetches it.
  const data = await getWorkspaceData(db, user, messId, role);

  return <WorkspaceShell initialData={data}>{children}</WorkspaceShell>;
}
