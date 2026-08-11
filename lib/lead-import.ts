import { canonicalizePhoneKey } from "@/lib/phone";
import type { HighestQualification } from "@/lib/types";

export type ParsedLeadRow = {
  rowNumber: number;
  full_name: string;
  phone: string;
  email: string | null;
  highest_qualification: HighestQualification | null;
  highest_qualification_other: string | null;
  description: string | null;
  error: string | null;
};

const HEADER_ALIASES: Record<string, string> = {
  full_name: "full_name",
  name: "full_name",
  phone: "phone",
  phone_number: "phone",
  mobile: "phone",
  email: "email",
  email_address: "email",
  education_level: "education_level",
  highest_qualification: "education_level",
  qualification: "education_level",
  when_do_you_want_to_start_the_course: "start_preference",
  when_do_you_want_to_start_the_course_: "start_preference",
  start_preference: "start_preference",
  when_to_start: "start_preference",
  description: "description",
  notes: "description",
};

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w?]/g, "");
}

function resolveHeader(header: string) {
  const normalized = normalizeHeader(header);
  return HEADER_ALIASES[normalized] ?? normalized;
}

/** Minimal RFC-style CSV parser for a single line. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map(resolveHeader);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

function cleanPhone(raw: string) {
  const trimmed = raw.trim().replace(/^p:/i, "");
  return canonicalizePhoneKey(trimmed) || trimmed;
}

function mapEducationLevel(raw: string | undefined): {
  highest_qualification: HighestQualification | null;
  highest_qualification_other: string | null;
} {
  const value = (raw ?? "").trim();
  if (!value) {
    return { highest_qualification: null, highest_qualification_other: null };
  }

  const lower = value.toLowerCase();

  if (
    lower.includes("high school") ||
    lower.includes("ged") ||
    lower.includes("o level") ||
    lower.includes("'o' level")
  ) {
    return { highest_qualification: "o_level", highest_qualification_other: null };
  }

  if (lower.includes("a level") || lower.includes("'a' level")) {
    return { highest_qualification: "a_level", highest_qualification_other: null };
  }

  if (lower.includes("30 year")) {
    return { highest_qualification: "30_year_above", highest_qualification_other: null };
  }

  return { highest_qualification: "other", highest_qualification_other: value };
}

function mapStartPreference(raw: string | undefined) {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (lower === "immediate") return "When to start: Immediate";
  if (lower.includes("checking")) return "When to start: Just checking";
  if (lower.includes("2_month") || lower.includes("2 month")) {
    return "When to start: In 2 months";
  }

  return `When to start: ${value.replace(/_/g, " ")}`;
}

function getCell(row: string[], headers: string[], key: string) {
  const index = headers.indexOf(key);
  if (index === -1) return "";
  return row[index]?.trim() ?? "";
}

export function mapLeadImportRows(headers: string[], rows: string[][]): ParsedLeadRow[] {
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const full_name = getCell(row, headers, "full_name");
    const phoneRaw = getCell(row, headers, "phone");
    const phone = phoneRaw ? cleanPhone(phoneRaw) : "";
    const email = getCell(row, headers, "email") || null;
    const education = mapEducationLevel(getCell(row, headers, "education_level"));
    const startNote = mapStartPreference(getCell(row, headers, "start_preference"));
    const extraDescription = getCell(row, headers, "description");
    const description =
      [startNote, extraDescription].filter(Boolean).join("\n") || null;

    let error: string | null = null;
    if (!full_name) error = "Full name is required";
    else if (!phone) error = "Valid phone is required";
    else if (!canonicalizePhoneKey(phone)) error = "Phone number could not be normalized";

    return {
      rowNumber,
      full_name,
      phone,
      email,
      highest_qualification: education.highest_qualification,
      highest_qualification_other: education.highest_qualification_other,
      description,
      error,
    };
  });
}

export function parseLeadImportCsv(text: string): ParsedLeadRow[] {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) return [];
  return mapLeadImportRows(headers, rows);
}

export const LEAD_IMPORT_TEMPLATE = [
  "full_name,phone_number,email,education_level,when_do_you_want_to_start_the_course?",
  "Jane Doe,p:+6591234567,jane@example.com,High school / GED,immediate",
].join("\n");
