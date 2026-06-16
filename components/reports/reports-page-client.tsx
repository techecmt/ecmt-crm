"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadFunnelReportsClient } from "@/components/reports/lead-funnel-reports-client";
import { UserAuditReportsClient } from "@/components/reports/user-audit-reports-client";

export function ReportsPageClient({
  isAdmin,
  currentUserId,
}: {
  isAdmin: boolean;
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Lead funnel and charts, plus admin-only CRM entry and user audit reports."
            : "Lead funnel and charts for your pipeline."}
        </p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="user">
          <TabsList>
            <TabsTrigger value="user">User Reports</TabsTrigger>
            <TabsTrigger value="admin">Admin Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="user" className="mt-4">
            <LeadFunnelReportsClient isAdmin currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value="admin" className="mt-4">
            <UserAuditReportsClient />
          </TabsContent>
        </Tabs>
      ) : (
        <LeadFunnelReportsClient currentUserId={currentUserId} />
      )}
    </div>
  );
}
