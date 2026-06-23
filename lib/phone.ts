const DEFAULT_PHONE_REGION = "SG";
const SG_COUNTRY_CODE = "65";

function toDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Returns a single canonical key for phone matching.
 *
 * Singapore defaults:
 * - +65 9123 4567  -> +6591234567
 * - 6591234567     -> +6591234567
 * - 91234567       -> +6591234567
 * - 091234567      -> +6591234567
 */
export function canonicalizePhoneKey(
  phone: string | null | undefined,
  region: string = DEFAULT_PHONE_REGION,
): string {
  let digits = toDigits(phone);
  if (!digits) return "";

  // Convert international 00 prefix into a plain country-code form.
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (region.toUpperCase() === "SG") {
    if (digits.startsWith(SG_COUNTRY_CODE) && digits.length >= 10) {
      return `+${digits}`;
    }
    if (digits.startsWith("0") && digits.length === 9) {
      return `+${SG_COUNTRY_CODE}${digits.slice(1)}`;
    }
    if (digits.length === 8) {
      return `+${SG_COUNTRY_CODE}${digits}`;
    }
  }

  if (digits.length < 7 || digits.length > 15) return "";
  return `+${digits}`;
}

/** Strip formatting and return digits suitable for wa.me links. */
export function normalizePhoneForWhatsApp(phone: string): string | null {
  const key = canonicalizePhoneKey(phone);
  if (!key) return null;
  return key.replace(/^\+/, "");
}

export function getWhatsAppUrl(phone: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}`;
}
