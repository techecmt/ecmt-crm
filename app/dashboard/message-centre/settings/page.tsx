import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { MessageCentreSettingsClient } from "@/components/message-centre/message-centre-settings-client";

export const dynamic = "force-dynamic";

export default async function MessageCentreSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard/message-centre");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Message Centre Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure AI behavior, knowledge blocks, and Messenger pages.
        </p>
      </div>
      <MessageCentreSettingsClient />
    </div>
  );
}
