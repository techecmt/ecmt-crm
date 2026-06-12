import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireModule } from "@/lib/auth";
import { USER_ROLE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await requireModule("settings");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and workspace preferences.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={profile.full_name || "—"} />
            <Row label="Email" value={profile.email} />
            <Row
              label="Role"
              value={
                <Badge variant="secondary">
                  {USER_ROLE_LABELS[profile.role]}
                </Badge>
              }
            />
            <Row label="Status" value={profile.is_active ? "Active" : "Inactive"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Centralised CRM for all colleges in your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This is a single-org CRM. Add colleges in the Colleges section,
              import leads, and assign them to counsellors.
            </p>
            <p>
              For role changes, ask a Super Admin to update your role from the
              Users page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
