import { Construction } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardUnderConstruction() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Dashboard under construction</CardTitle>
          <CardDescription>
            We are rebuilding this overview. Use Leads, Follow-ups, and Reports in the
            meantime.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          This page will return with updated metrics soon.
        </CardContent>
      </Card>
    </div>
  );
}
