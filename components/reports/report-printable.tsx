"use client";

import * as React from "react";
import { format } from "date-fns";
import { FileDown } from "lucide-react";
import { useReactToPrint } from "react-to-print";

import { Button } from "@/components/ui/button";

export function joinFilterParts(
  parts: Array<string | null | undefined | false>,
): string {
  return parts.filter(Boolean).join(" · ");
}

type ReportPrintableProps = {
  title: string;
  documentTitle?: string;
  filterSummary?: string;
  children: React.ReactNode;
};

export function ReportPrintable({
  title,
  documentTitle,
  filterSummary,
  children,
}: ReportPrintableProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [generatedAt] = React.useState(() =>
    format(new Date(), "d MMM yyyy, h:mm a"),
  );

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: documentTitle ?? title,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 15mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `,
  });

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => handlePrint()}>
          <FileDown className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </div>

      <div
        ref={contentRef}
        className="report-print-root space-y-6 bg-background text-foreground"
      >
        <div className="report-print-header">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {filterSummary ? (
            <p className="mt-2 text-sm text-muted-foreground">{filterSummary}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">Generated {generatedAt}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
