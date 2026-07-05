"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RegistrationReportsClient } from "@/components/reports/registration-reports-client";
import { UserAuditReportsClient } from "@/components/reports/user-audit-reports-client";

export function AdminReportsClient() {
  return (
    <Tabs defaultValue="registration">
      <TabsList>
        <TabsTrigger value="registration">Registration Report</TabsTrigger>
        <TabsTrigger value="user-audit">User Audit</TabsTrigger>
      </TabsList>
      <TabsContent value="registration" className="mt-4">
        <RegistrationReportsClient />
      </TabsContent>
      <TabsContent value="user-audit" className="mt-4">
        <UserAuditReportsClient />
      </TabsContent>
    </Tabs>
  );
}
