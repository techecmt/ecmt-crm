"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComparisonReportsClient } from "@/components/reports/comparison-reports-client";
import { CustomerAnalysisReportsClient } from "@/components/reports/customer-analysis-reports-client";
import { RegistrationReportsClient } from "@/components/reports/registration-reports-client";
import { UserAuditReportsClient } from "@/components/reports/user-audit-reports-client";

export function AdminReportsClient() {
  return (
    <Tabs defaultValue="comparison">
      <TabsList>
        <TabsTrigger value="comparison">Comparison Report</TabsTrigger>
        <TabsTrigger value="registration">Registration Report</TabsTrigger>
        <TabsTrigger value="customer-analysis">Customer Analysis</TabsTrigger>
        <TabsTrigger value="user-audit">User Audit</TabsTrigger>
      </TabsList>
      <TabsContent value="comparison" className="mt-4">
        <ComparisonReportsClient />
      </TabsContent>
      <TabsContent value="registration" className="mt-4">
        <RegistrationReportsClient />
      </TabsContent>
      <TabsContent value="customer-analysis" className="mt-4">
        <CustomerAnalysisReportsClient />
      </TabsContent>
      <TabsContent value="user-audit" className="mt-4">
        <UserAuditReportsClient />
      </TabsContent>
    </Tabs>
  );
}
