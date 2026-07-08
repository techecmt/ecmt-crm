"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { startOfMonth } from "date-fns";
import { getSgtMonthKey } from "@/lib/timezone";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LEAD_SOURCE_LABELS,
  type Lead,
  type LeadSource,
} from "@/lib/types";

const sourcePalette = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function formatSgtMonthShort(input: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short",
    year: "2-digit",
  }).format(input);
}

export function MarketingPageClient({ leads }: { leads: Lead[] }) {
  const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];
  const isRegistered = (status: Lead["status"]) =>
    status === "registered_closed" || status === "registered_paid_reg_fee";

  const sourceData = sources
    .map((src, i) => {
      const list = leads.filter((l) => l.source === src);
      const admitted = list.filter((l) => isRegistered(l.status)).length;
      return {
        key: src,
        label: LEAD_SOURCE_LABELS[src],
        leads: list.length,
        admitted,
        conversion:
          list.length > 0 ? Math.round((admitted / list.length) * 1000) / 10 : 0,
        fill: sourcePalette[i % sourcePalette.length],
      };
    })
    .filter((s) => s.leads > 0);

  const sourceConfig: ChartConfig = sourceData.reduce<ChartConfig>(
    (acc, cur) => ({
      ...acc,
      [cur.key]: { label: cur.label, color: cur.fill },
    }),
    {},
  );

  // Monthly trend over the last 6 months
  const buckets: { month: string; total: number; admitted: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const bucketMonthKey = getSgtMonthKey(d);
    const key = formatSgtMonthShort(d);
    const monthLeads = leads.filter((l) => {
      return getSgtMonthKey(l.created_at) === bucketMonthKey;
    });
    buckets.push({
      month: key,
      total: monthLeads.length,
      admitted: monthLeads.filter((l) => isRegistered(l.status)).length,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Source-wise performance, conversion and trends.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lead share by source</CardTitle>
            <CardDescription>How marketing channels split overall volume.</CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <Empty />
            ) : (
              <ChartContainer config={sourceConfig} className="h-[280px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={sourceData}
                    dataKey="leads"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={90}
                    strokeWidth={2}
                  >
                    {sourceData.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Conversion by source</CardTitle>
            <CardDescription>
              Admission-confirmed conversions vs total leads per source.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <Empty />
            ) : (
              <ChartContainer
                config={{
                  leads: { label: "Leads", color: "hsl(var(--chart-1))" },
                  admitted: { label: "Admitted", color: "hsl(var(--chart-2))" },
                }}
                className="h-[280px]"
              >
                <BarChart data={sourceData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={0}
                    angle={-12}
                    height={50}
                  />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={4} />
                  <Bar dataKey="admitted" fill="hsl(var(--chart-2))" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly lead trend</CardTitle>
          <CardDescription>
            Last 6 months — total inquiries vs admissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              total: { label: "Leads", color: "hsl(var(--chart-1))" },
              admitted: { label: "Admitted", color: "hsl(var(--chart-2))" },
            }}
            className="h-[300px]"
          >
            <LineChart data={buckets}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="admitted"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      No data yet
    </div>
  );
}
