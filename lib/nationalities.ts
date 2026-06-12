/** Nationality options for lead intake and counselling completion. */
export const NATIONALITY_OPTIONS = [
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Thailand",
  "Vietnam",
  "Myanmar",
  "South Korea",
  "China",
  "Japan",
  "India",
  "Pakistan",
  "Sri Lanka",
  "Bangladesh",
  "UAE",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Jordan",
  "Lebanon",
  "Other",
] as const;

export type NationalityOption = (typeof NATIONALITY_OPTIONS)[number];

export function isKnownNationality(
  value: string | null | undefined,
): value is NationalityOption {
  if (!value) return false;
  return (NATIONALITY_OPTIONS as readonly string[]).includes(value);
}

export function nationalityFormDefaults(lead: {
  nationality: string | null;
  nationality_other?: string | null;
}) {
  if (!lead.nationality) {
    return { nationality: "", nationality_other: "" };
  }
  if (isKnownNationality(lead.nationality)) {
    return {
      nationality: lead.nationality,
      nationality_other:
        lead.nationality === "Other" ? lead.nationality_other ?? "" : "",
    };
  }
  return { nationality: "Other", nationality_other: lead.nationality };
}
