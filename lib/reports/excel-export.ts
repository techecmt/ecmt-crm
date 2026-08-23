import writeXlsxFile, { type SheetData } from "write-excel-file/browser";

export type ExcelValue = string | number | boolean | Date | null;
export type ExcelRow = ExcelValue[];
export type { SheetData };

export type ExcelSheet = {
  sheet: string;
  data: SheetData;
  columns?: Array<{ width: number }>;
};

export function excelColumns(headers: string[], minWidth = 14) {
  return headers.map((header) => ({
    width: Math.max(header.length + 2, minWidth),
  }));
}

export function excelSheet(
  name: string,
  headers: string[],
  rows: ExcelRow[],
  options?: { minWidth?: number },
): ExcelSheet {
  return {
    sheet: name.slice(0, 31),
    data: [headers, ...rows] as SheetData,
    columns: excelColumns(headers, options?.minWidth),
  };
}

export function excelFilename(parts: Array<string | null | undefined>) {
  const base = parts
    .filter(Boolean)
    .join("_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${base || "Report"}.xlsx`;
}

export async function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const payload = sheets.filter((sheet) => sheet.data.length > 0);
  if (payload.length === 0) {
    throw new Error("No data to export.");
  }
  await writeXlsxFile(payload).toFile(
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}
