"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";

import { CourseCombobox } from "@/components/leads/course-combobox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useColleges } from "@/lib/hooks/use-colleges";
import { useBulkImportLeads } from "@/lib/hooks/use-leads";
import {
  LEAD_IMPORT_TEMPLATE,
  parseLeadImportCsv,
  type ParsedLeadRow,
} from "@/lib/lead-import";
import {
  LEAD_SOURCE_LABELS,
  type LeadSource,
} from "@/lib/types";

const sources = Object.keys(LEAD_SOURCE_LABELS) as LeadSource[];

export function LeadImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: colleges } = useColleges({ activeOnly: true });
  const importLeads = useBulkImportLeads();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [collegeId, setCollegeId] = React.useState("");
  const [course, setCourse] = React.useState("");
  const [source, setSource] = React.useState<LeadSource>("meta_ads");
  const [rows, setRows] = React.useState<ParsedLeadRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const selectedCollege = colleges?.find((college) => college.id === collegeId);
  const courses = selectedCollege?.courses ?? [];
  const validRows = rows.filter((row) => !row.error);
  const invalidRows = rows.filter((row) => row.error);

  React.useEffect(() => {
    if (!open) {
      setRows([]);
      setParseError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const loadCsvText = (text: string) => {
    setParseError(null);
    const parsed = parseLeadImportCsv(text);
    if (parsed.length === 0) {
      setRows([]);
      setParseError("No data rows found. Check your CSV format.");
      return;
    }
    setRows(parsed);
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadCsvText(text);
  };

  const onDownloadTemplate = () => {
    const blob = new Blob([LEAD_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lead-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const canImport =
    collegeId &&
    course.trim() &&
    validRows.length > 0 &&
    !importLeads.isPending;

  const onImport = async () => {
    if (!canImport) return;

    const result = await importLeads.mutateAsync({
      rows,
      defaults: {
        college_id: collegeId,
        interested_course: course.trim(),
        source,
        assigned_counsellor: null,
      },
    });

    if (result.failed.length === 0) {
      onOpenChange(false);
    } else if (result.imported > 0) {
      setRows((current) =>
        current.filter((row) =>
          result.failed.some((failed) => failed.rowNumber === row.rowNumber),
        ),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            Import leads
          </DialogTitle>
          <DialogDescription>
            Upload a CSV and apply the same college, course, and source to every row.
            Leads are imported unassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="import-college">College</Label>
              <Select value={collegeId} onValueChange={setCollegeId}>
                <SelectTrigger id="import-college">
                  <SelectValue placeholder="Select college" />
                </SelectTrigger>
                <SelectContent>
                  {(colleges ?? []).map((college) => (
                    <SelectItem key={college.id} value={college.id}>
                      {college.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Course</Label>
              <CourseCombobox
                value={course}
                onChange={setCourse}
                courses={courses}
                placeholder="Select course"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-source">Source</Label>
              <Select
                value={source}
                onValueChange={(value) => setSource(value as LeadSource)}
              >
                <SelectTrigger id="import-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((item) => (
                    <SelectItem key={item} value={item}>
                      {LEAD_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-file">CSV file</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="import-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onFileChange}
              />
              <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
                Download template
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected columns: full_name, phone_number, email, education_level,
              when_do_you_want_to_start_the_course?
            </p>
          </div>

          {parseError ? (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          ) : null}

          {rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Preview</span>
                <span className="text-muted-foreground">
                  {validRows.length} ready
                  {invalidRows.length > 0 ? `, ${invalidRows.length} with errors` : ""}
                </span>
              </div>
              <div className="max-h-56 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.full_name || "—"}</TableCell>
                        <TableCell>{row.phone || "—"}</TableCell>
                        <TableCell>{row.email || "—"}</TableCell>
                        <TableCell className={row.error ? "text-destructive" : "text-muted-foreground"}>
                          {row.error ?? "Ready"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onImport} disabled={!canImport}>
            {importLeads.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${validRows.length || ""} lead${validRows.length === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
